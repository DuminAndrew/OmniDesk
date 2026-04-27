const { EventEmitter } = require('events');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');

const credentialsManager = require('./credentialsManager');
const logger = require('../utils/logger');
const { normalizeTgMessage, composeTgBody } = require('../utils/messageFormatter');
const mediaCache = require('./mediaCache');

class TelegramService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.connected = false;
    this.pendingLogin = null;
  }

  _buildProxy(proxyCfg) {
    if (!proxyCfg || proxyCfg.type === 'none') return undefined;
    if (proxyCfg.type === 'socks5') {
      return {
        ip: proxyCfg.host, port: Number(proxyCfg.port), socksType: 5,
        username: proxyCfg.username || undefined, password: proxyCfg.password || undefined,
        timeout: 10
      };
    }
    if (proxyCfg.type === 'mtproxy') {
      return { ip: proxyCfg.host, port: Number(proxyCfg.port), MTProxy: true, secret: proxyCfg.secret, timeout: 10 };
    }
    return undefined;
  }

  _newClient(apiId, apiHash, sessionStr, proxyCfg) {
    const session = new StringSession(sessionStr || '');
    const proxy = this._buildProxy(proxyCfg);
    const opts = { connectionRetries: 5, autoReconnect: true, useWSS: false };
    if (proxy) opts.proxy = proxy;
    return new TelegramClient(session, Number(apiId), String(apiHash), opts);
  }

  async startLogin({ apiId, apiHash, phoneNumber, proxyCfg }) {
    if (this.client && this.connected) throw new Error('Telegram already connected');

    this.pendingLogin = {
      phoneNumber,
      codeResolver: null, passwordResolver: null,
      codePromise: null, passwordPromise: null
    };
    this.pendingLogin.codePromise = new Promise((res) => { this.pendingLogin.codeResolver = res; });
    this.pendingLogin.passwordPromise = new Promise((res) => { this.pendingLogin.passwordResolver = res; });

    this.client = this._newClient(apiId, apiHash, '', proxyCfg);

    const startPromise = this.client.start({
      phoneNumber: async () => phoneNumber,
      phoneCode:   async () => this.pendingLogin.codePromise,
      password:    async () => this.pendingLogin.passwordPromise,
      onError:     (err) => { logger.error('TG login error', err.message); this.emit('login:error', err.message); }
    });

    startPromise.then(() => this._onConnected({ apiId, apiHash })).catch((err) => {
      logger.error('TG start failed', err.message);
      this.emit('login:error', err.message);
    });

    return { status: 'awaiting_code' };
  }

  submitCode(code) {
    if (!this.pendingLogin?.codeResolver) throw new Error('No pending Telegram login');
    this.pendingLogin.codeResolver(String(code).trim());
    return { ok: true };
  }
  submitPassword(password) {
    if (!this.pendingLogin?.passwordResolver) throw new Error('No pending Telegram login');
    this.pendingLogin.passwordResolver(String(password));
    return { ok: true };
  }

  async _onConnected({ apiId, apiHash }) {
    this.connected = true;
    const sessionStr = this.client.session.save();
    credentialsManager.saveTelegramConfig({ apiId, apiHash });
    credentialsManager.saveTelegramSession(sessionStr);
    this.pendingLogin = null;
    this._wireEvents();
    logger.info('Telegram connected');
    this.emit('login:success');
    this.emit('status', { connected: true });
    this._seedDialogs().catch((e) => logger.warn('TG seed failed', e.message));
  }

  async _seedDialogs() {
    const dialogs = await this.listDialogs(80);
    for (const d of dialogs) {
      this.emit('seed', {
        source: 'tg',
        externalChatId: d.externalId,
        title: d.title,
        avatarUrl: d.avatarUrl,
        body: d.lastMessage || '',
        ts: d.lastTs || Date.now(),
        unread: d.unread || 0
      });
    }
    this.emit('seedComplete');
  }

  async connectFromSession() {
    const cfg = credentialsManager.loadTelegramConfig();
    const sessionStr = credentialsManager.loadTelegramSession();
    const proxyCfg = credentialsManager.loadProxy();
    if (!cfg || !sessionStr) return false;

    this.client = this._newClient(cfg.apiId, cfg.apiHash, sessionStr, proxyCfg);
    try {
      await this.client.connect();
      const me = await this.client.getMe().catch(() => null);
      if (!me) {
        logger.warn('TG session invalid, clearing');
        credentialsManager.clearTelegram();
        this.client = null;
        return false;
      }
      this.connected = true;
      this._wireEvents();
      logger.info('Telegram reconnected as', me.username || me.firstName);
      this.emit('status', { connected: true });
      this._seedDialogs().catch(() => {});
      return true;
    } catch (err) {
      logger.error('TG reconnect failed', err.message);
      this.client = null;
      return false;
    }
  }

  _wireEvents() {
    if (!this.client) return;
    this.client.addEventHandler(async (event) => {
      try {
        const msg = event.message;
        if (!msg) return;
        const peer = await msg.getChat().catch(() => null);
        const sender = await msg.getSender().catch(() => null);
        const title = (peer && (peer.title || peer.firstName)) ||
                      (sender && (sender.firstName || sender.username)) ||
                      null;
        const out = msg.out === true;
        const externalChatId = String(msg.chatId || msg.peerId?.userId || msg.peerId?.chatId || msg.peerId?.channelId || msg.peerId);
        const n = normalizeTgMessage(msg);

        let sender_name = null;
        if (!out && sender) {
          sender_name = (sender.firstName ? sender.firstName + (sender.lastName ? ' ' + sender.lastName : '') : null)
            || sender.title
            || sender.username
            || null;
        }

        this.emit('message', {
          source: 'tg',
          externalChatId,
          title,
          avatarUrl: null,
          body: n.body,
          attachments: n.attachments,
          reply_to_text: n.reply_to_text,
          reply_to_author: n.reply_to_author,
          sender_name,
          sender_avatar: null,
          ts: (msg.date || Math.floor(Date.now() / 1000)) * 1000,
          direction: out ? 'out' : 'in',
          externalId: String(msg.id)
        });

        // Background avatar fetch (don't block message handling)
        if (peer) this._ensureAvatar(peer, externalChatId).catch(() => {});
      } catch (err) {
        logger.error('TG event handler error', err.message);
      }
    }, new NewMessage({}));
  }

  /**
   * Download a Telegram chat profile photo to %APPDATA%/OmniDesk/cache/avatars/.
   * Idempotent — skips if file already exists. Emits 'avatar:ready' so the
   * renderer can reload the chat row.
   */
  async _ensureAvatar(entity, externalId) {
    if (!entity || !externalId) return null;
    if (mediaCache.avatarExists('tg', externalId)) {
      return mediaCache.avatarUrl('tg', externalId);
    }
    try {
      const buffer = await this.client.downloadProfilePhoto(entity, { isBig: false });
      if (!buffer || !buffer.length) return null;
      const file = mediaCache.avatarFile('tg', externalId);
      mediaCache.writeBuffer(file, buffer);
      const url = mediaCache.avatarUrl('tg', externalId);
      this.emit('avatar:ready', { source: 'tg', externalChatId: externalId, avatarUrl: url });
      return url;
    } catch (err) {
      // Many users / channels don't have a photo — fail quietly
      return null;
    }
  }

  async listDialogs(limit = 80) {
    if (!this.client || !this.connected) return [];
    const dialogs = await this.client.getDialogs({ limit });
    const out = [];
    for (const d of dialogs) {
      const externalId = String(d.id);
      // Try to use existing cached avatar; trigger background download if missing
      let avatarUrl = mediaCache.avatarExists('tg', externalId)
        ? mediaCache.avatarUrl('tg', externalId)
        : null;
      if (!avatarUrl && d.entity) {
        // fire-and-forget
        this._ensureAvatar(d.entity, externalId).catch(() => {});
      }
      out.push({
        externalId,
        title: d.title || d.name || 'Telegram',
        avatarUrl,
        lastMessage: d.message ? composeTgBody(d.message) : '',
        lastTs: d.message ? (d.message.date * 1000) : null,
        unread: d.unreadCount || 0
      });
    }
    return out;
  }

  async loadHistory(externalChatId, limit = 100) {
    if (!this.client || !this.connected) return [];
    const entity = /^-?\d+$/.test(String(externalChatId)) ? Number(externalChatId) : externalChatId;
    const messages = await this.client.getMessages(entity, { limit });
    const out = [];
    for (const m of messages.slice().reverse()) {
      const n = normalizeTgMessage(m);
      let sender_name = null;
      if (!m.out) {
        const sender = await m.getSender().catch(() => null);
        if (sender) {
          sender_name = (sender.firstName ? sender.firstName + (sender.lastName ? ' ' + sender.lastName : '') : null)
            || sender.title
            || sender.username
            || null;
        }
      }
      out.push({
        externalId: String(m.id),
        direction: m.out ? 'out' : 'in',
        body: n.body,
        attachments: n.attachments,
        reply_to_text: n.reply_to_text,
        reply_to_author: n.reply_to_author,
        sender_name,
        ts: (m.date || 0) * 1000
      });
    }
    return out;
  }

  /**
   * Download a single TG media item (photo/voice/file) on demand.
   * Returns the omnidesk:// URL for renderer use.
   */
  async downloadMedia({ externalChatId, msgId, kind, ext }) {
    if (!this.client || !this.connected) throw new Error('Telegram not connected');
    if (mediaCache.mediaExists('tg', kind, externalChatId, msgId, ext)) {
      return mediaCache.mediaUrl('tg', kind, externalChatId, msgId, ext);
    }
    const entity = /^-?\d+$/.test(String(externalChatId)) ? Number(externalChatId) : externalChatId;
    const [msg] = await this.client.getMessages(entity, { ids: [Number(msgId)] });
    if (!msg) throw new Error('Message not found');
    const buffer = await this.client.downloadMedia(msg);
    if (!buffer || !buffer.length) throw new Error('Empty media');
    const file = mediaCache.mediaFile('tg', kind, externalChatId, msgId, ext);
    mediaCache.writeBuffer(file, buffer);
    return mediaCache.mediaUrl('tg', kind, externalChatId, msgId, ext);
  }

  async sendMessage(externalChatId, text) {
    if (!this.client || !this.connected) throw new Error('Telegram not connected');
    let entity = externalChatId;
    if (/^-?\d+$/.test(String(externalChatId))) entity = Number(externalChatId);
    await this.client.sendMessage(entity, { message: String(text) });
    return { ok: true };
  }

  async disconnect() {
    if (this.client) { try { await this.client.disconnect(); } catch (_) {} this.client = null; }
    this.connected = false;
    this.emit('status', { connected: false });
  }
  async logout() { await this.disconnect(); credentialsManager.clearTelegram(); }
  status() { return { connected: this.connected }; }
}

module.exports = new TelegramService();
