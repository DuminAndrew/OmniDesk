const { EventEmitter } = require('events');
const { VK } = require('vk-io');
const credentialsManager = require('./credentialsManager');
const logger = require('../utils/logger');

class VkService extends EventEmitter {
  constructor() {
    super();
    this.vk = null;
    this.connected = false;
  }

  async connectFromToken() {
    const token = credentialsManager.loadVkToken();
    if (!token) return false;
    return this._connectWith(token);
  }

  async loginWithToken(token) {
    credentialsManager.saveVkToken(token);
    return this._connectWith(token);
  }

  async _connectWith(token) {
    try {
      this.vk = new VK({ token });
      // Validate token
      const [me] = await this.vk.api.users.get({});
      logger.info('VK connected as', me.first_name, me.last_name);

      this.vk.updates.on('message_new', (ctx) => {
        try {
          const peerId = ctx.peerId;
          const text = ctx.text || '';
          const isOut = ctx.isOutbox;
          const ts = (ctx.createdAt || Math.floor(Date.now() / 1000)) * 1000;
          const senderName = ctx.senderId ? `VK #${ctx.senderId}` : 'VK';
          this.emit('message', {
            source: 'vk',
            externalChatId: String(peerId),
            title: senderName,
            body: text,
            ts,
            direction: isOut ? 'out' : 'in',
            externalId: ctx.id ? String(ctx.id) : null
          });
        } catch (err) {
          logger.error('VK message_new handler', err.message);
        }
      });

      await this.vk.updates.start();
      this.connected = true;
      this.emit('status', { connected: true });
      this._seedDialogs().catch(() => {});
      return true;
    } catch (err) {
      logger.error('VK connect failed', err.message);
      this.connected = false;
      this.vk = null;
      throw err;
    }
  }

  async sendMessage(peerId, text) {
    if (!this.vk || !this.connected) throw new Error('VK not connected');
    const random_id = Math.floor(Math.random() * 1e9);
    await this.vk.api.messages.send({
      peer_id: Number(peerId),
      message: String(text),
      random_id
    });
    return { ok: true };
  }

  async _seedDialogs() {
    const dialogs = await this.listDialogs(80);
    for (const d of dialogs) {
      this.emit('seed', {
        source: 'vk',
        externalChatId: d.externalId,
        title: d.title,
        body: d.lastMessage || '',
        ts: d.lastTs || Date.now(),
        unread: d.unread || 0
      });
    }
    this.emit('seedComplete');
  }

  async listDialogs(count = 50) {
    if (!this.vk || !this.connected) return [];
    const res = await this.vk.api.messages.getConversations({ count });
    const items = res.items || [];
    const profiles = res.profiles || [];
    const groups = res.groups || [];
    return items.map(it => {
      const conv = it.conversation;
      const peer = conv.peer;
      let title = 'VK';
      if (peer.type === 'user') {
        const p = profiles.find(p => p.id === peer.id);
        title = p ? `${p.first_name} ${p.last_name}` : `User #${peer.id}`;
      } else if (peer.type === 'chat') {
        title = conv.chat_settings?.title || `Chat #${peer.id}`;
      } else if (peer.type === 'group') {
        const g = groups.find(g => g.id === Math.abs(peer.id));
        title = g ? g.name : `Group #${peer.id}`;
      }
      return {
        externalId: String(peer.id),
        title,
        lastMessage: it.last_message ? it.last_message.text : '',
        lastTs: it.last_message ? it.last_message.date * 1000 : null,
        unread: conv.unread_count || 0
      };
    });
  }

  async disconnect() {
    if (this.vk) {
      try { await this.vk.updates.stop(); } catch (_) {}
      this.vk = null;
    }
    this.connected = false;
    this.emit('status', { connected: false });
  }

  async logout() {
    await this.disconnect();
    credentialsManager.clearVk();
  }

  status() {
    return { connected: this.connected };
  }
}

module.exports = new VkService();
