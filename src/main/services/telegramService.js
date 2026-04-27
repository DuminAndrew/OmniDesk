const { EventEmitter } = require('events');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');

const credentialsManager = require('./credentialsManager');
const logger = require('../utils/logger');

class TelegramService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.connected = false;
    this.pendingLogin = null; // { phoneNumber, resolvers... }
  }

  /**
   * Build the proxy descriptor expected by GramJS from our generic shape.
   * Supports 'socks5' and 'mtproxy'. Returns undefined when 'none'.
   */
  _buildProxy(proxyCfg) {
    if (!proxyCfg || proxyCfg.type === 'none') return undefined;

    if (proxyCfg.type === 'socks5') {
      return {
        ip: proxyCfg.host,
        port: Number(proxyCfg.port),
        socksType: 5,
        username: proxyCfg.username || undefined,
        password: proxyCfg.password || undefined,
        timeout: 10
      };
    }

    if (proxyCfg.type === 'mtproxy') {
      return {
        ip: proxyCfg.host,
        port: Number(proxyCfg.port),
        MTProxy: true,
        secret: proxyCfg.secret,
        timeout: 10
      };
    }

    return undefined;
  }

  _newClient(apiId, apiHash, sessionStr, proxyCfg) {
    const session = new StringSession(sessionStr || '');
    const proxy = this._buildProxy(proxyCfg);
    const opts = {
      connectionRetries: 5,
      autoReconnect: true,
      useWSS: false
    };
    if (proxy) opts.proxy = proxy;
    return new TelegramClient(session, Number(apiId), String(apiHash), opts);
  }

  /**
   * Begin interactive login. The client is started with callbacks that resolve
   * via async promises driven by IPC: submitCode() / submitPassword().
   */
  async startLogin({ apiId, apiHash, phoneNumber, proxyCfg }) {
    if (this.client && this.connected) {
      throw new Error('Telegram already connected');
    }

    this.pendingLogin = {
      phoneNumber,
      codeResolver: null,
      passwordResolver: null,
      codePromise: new Promise((res) => { this._setCodeResolver = res; }),
      passwordPromise: new Promise((res) => { this._setPasswordResolver = res; })
    };
    this.pendingLogin.codePromise = new Promise((res) => { this.pendingLogin.codeResolver = res; });
    this.pendingLogin.passwordPromise = new Promise((res) => { this.pendingLogin.passwordResolver = res; });

    this.client = this._newClient(apiId, apiHash, '', proxyCfg);

    // GramJS wants a phone callback returning a string
    const startPromise = this.client.start({
      phoneNumber: async () => phoneNumber,
      phoneCode:   async () => this.pendingLogin.codePromise,
      password:    async () => this.pendingLogin.passwordPromise,
      onError:     (err) => { logger.error('TG login error', err.message); this.emit('login:error', err.message); }
    });

    // Don't await here — we need the IPC layer to be able to feed us code/password.
    startPromise.then(() => this._onConnected({ apiId, apiHash })).catch((err) => {
      logger.error('TG start failed', err.message);
      this.emit('login:error', err.message);
    });

    return { status: 'awaiting_code' };
  }

  submitCode(code) {
    if (!this.pendingLogin || !this.pendingLogin.codeResolver) {
      throw new Error('No pending Telegram login');
    }
    this.pendingLogin.codeResolver(String(code).trim());
    return { ok: true };
  }

  submitPassword(password) {
    if (!this.pendingLogin || !this.pendingLogin.passwordResolver) {
      throw new Error('No pending Telegram login');
    }
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
    this._seedDialogs().catch(() => {});
  }

  async _seedDialogs() {
    const dialogs = await this.listDialogs(80);
    for (const d of dialogs) {
      this.emit('seed', {
        source: 'tg',
        externalChatId: d.externalId,
        title: d.title,
        body: d.lastMessage || '',
        ts: d.lastTs || Date.now(),
        unread: d.unread || 0
      });
    }
    this.emit('seedComplete');
  }

  /**
   * Connect using an existing saved session. Returns true on success.
   */
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
        if (!msg || !msg.message) return;
        const peer = await msg.getChat().catch(() => null);
        const sender = await msg.getSender().catch(() => null);
        const title = (peer && (peer.title || peer.firstName)) ||
                      (sender && (sender.firstName || sender.username)) ||
                      'Telegram';
        const out = msg.out === true;
        this.emit('message', {
          source: 'tg',
          externalChatId: String(msg.chatId || msg.peerId?.userId || msg.peerId?.chatId || msg.peerId),
          title,
          body: msg.message,
          ts: (msg.date || Math.floor(Date.now() / 1000)) * 1000,
          direction: out ? 'out' : 'in',
          externalId: String(msg.id)
        });
      } catch (err) {
        logger.error('TG event handler error', err.message);
      }
    }, new NewMessage({}));
  }

  async sendMessage(externalChatId, text) {
    if (!this.client || !this.connected) throw new Error('Telegram not connected');
    let entity = externalChatId;
    if (/^-?\d+$/.test(String(externalChatId))) {
      entity = Number(externalChatId);
    }
    await this.client.sendMessage(entity, { message: String(text) });
    return { ok: true };
  }

  async listDialogs(limit = 50) {
    if (!this.client || !this.connected) return [];
    const dialogs = await this.client.getDialogs({ limit });
    return dialogs.map(d => ({
      externalId: String(d.id),
      title: d.title || d.name || 'Telegram',
      lastMessage: d.message ? d.message.message : '',
      lastTs: d.message ? (d.message.date * 1000) : null,
      unread: d.unreadCount || 0
    }));
  }

  async disconnect() {
    if (this.client) {
      try { await this.client.disconnect(); } catch (_) {}
      this.client = null;
    }
    this.connected = false;
    this.emit('status', { connected: false });
  }

  async logout() {
    await this.disconnect();
    credentialsManager.clearTelegram();
  }

  status() {
    return { connected: this.connected };
  }
}

module.exports = new TelegramService();
