const { EventEmitter } = require('events');
const { VK } = require('vk-io');
const credentialsManager = require('./credentialsManager');
const logger = require('../utils/logger');
const { normalizeVkMessage, composeVkBody } = require('../utils/messageFormatter');

// VK returns these URLs for users/groups that have no real avatar.
// We treat them as null so the renderer falls back to initials.
function realAvatar(url) {
  if (!url) return null;
  if (/\/images\/(camera|deactivated|community)_/i.test(url)) return null;
  return url;
}

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
      const [me] = await this.vk.api.users.get({});
      logger.info('VK connected as', me.first_name, me.last_name);

      this.vk.updates.on('message_new', async (ctx) => {
        try {
          const peerId = ctx.peerId;
          const isOut = ctx.isOutbox;
          const ts = (ctx.createdAt || Math.floor(Date.now() / 1000)) * 1000;

          const raw = ctx.message || ctx.payload || {};
          const m = {
            text:          raw.text || ctx.text || '',
            attachments:   raw.attachments || ctx.attachments || [],
            geo:           raw.geo || ctx.geo,
            fwd_messages:  raw.fwd_messages || raw.forwards,
            reply_message: raw.reply_message || raw.replyMessage
          };
          const normalized = normalizeVkMessage(m);
          // Live message_new doesn't include the profiles batch — resolve
          // reply author lazily via _resolvePeer if we have the from_id.
          if (m.reply_message?.from_id && !normalized.reply_to_author) {
            const r = await this._resolvePeer(m.reply_message.from_id).catch(() => null);
            if (r) normalized.reply_to_author = r.title;
          }
          const meta = await this._resolvePeer(peerId).catch(() => null);

          // For incoming messages in chats/groups, resolve the actual sender
          // (different from the conversation peer)
          let sender_name = null, sender_avatar = null;
          if (!isOut && raw.from_id && raw.from_id !== Number(peerId)) {
            const s = await this._resolvePeer(raw.from_id).catch(() => null);
            if (s) { sender_name = s.title; sender_avatar = s.avatarUrl; }
          }

          this.emit('message', {
            source: 'vk',
            externalChatId: String(peerId),
            title:    meta ? meta.title : null,
            avatarUrl: meta ? meta.avatarUrl : null,
            body:     normalized.body,
            attachments: normalized.attachments,
            reply_to_text: normalized.reply_to_text,
            reply_to_author: normalized.reply_to_author,
            sender_name,
            sender_avatar,
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

  async _seedDialogs() {
    const dialogs = await this.listDialogs(100);
    for (const d of dialogs) {
      this.emit('seed', {
        source: 'vk',
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

  async _resolvePeer(peerId) {
    if (!this.vk) return null;
    const id = Number(peerId);
    if (id > 0 && id < 2000000000) {
      const [u] = await this.vk.api.users.get({ user_ids: String(id), fields: 'photo_100' });
      if (!u) return null;
      return { title: `${u.first_name} ${u.last_name}`, avatarUrl: u.photo_100 || null };
    }
    if (id < 0) {
      const res = await this.vk.api.groups.getById({ group_id: String(Math.abs(id)), fields: 'photo_100' });
      const g = (res && (res.groups || res))[0];
      if (!g) return null;
      return { title: g.name, avatarUrl: realAvatar(g.photo_100) };
    }
    if (id >= 2000000000) {
      const res = await this.vk.api.messages.getConversationsById({
        peer_ids: String(id), extended: 1, fields: 'photo_100'
      }).catch(() => null);
      const conv = res && res.items && res.items[0];
      if (!conv) return null;
      return {
        title: conv.chat_settings?.title || `Беседа`,
        avatarUrl: realAvatar(conv.chat_settings?.photo?.photo_100)
      };
    }
    return null;
  }

  async listDialogs(count = 100) {
    if (!this.vk || !this.connected) return [];
    const res = await this.vk.api.messages.getConversations({
      count, extended: 1, fields: 'photo_100,first_name,last_name'
    });
    const items = res.items || [];
    const profiles = res.profiles || [];
    const groups = res.groups || [];

    const missingUserIds = items
      .map(it => it.conversation.peer)
      .filter(p => p.type === 'user' && !profiles.find(pr => pr.id === p.id))
      .map(p => p.id);
    if (missingUserIds.length) {
      try {
        const extra = await this.vk.api.users.get({
          user_ids: missingUserIds.join(','), fields: 'photo_100'
        });
        profiles.push(...extra);
      } catch (err) { logger.warn('users.get fallback failed', err.message); }
    }

    return items.map(it => {
      const conv = it.conversation;
      const peer = conv.peer;
      let title = 'VK', avatarUrl = null;
      if (peer.type === 'user') {
        const p = profiles.find(p => p.id === peer.id);
        if (p) { title = `${p.first_name} ${p.last_name}`; avatarUrl = p.photo_100 || null; }
        else   { title = `Пользователь VK`; }
      } else if (peer.type === 'chat') {
        title = conv.chat_settings?.title || `Беседа`;
        avatarUrl = conv.chat_settings?.photo?.photo_100 || null;
      } else if (peer.type === 'group') {
        const g = groups.find(g => g.id === Math.abs(peer.id));
        if (g) { title = g.name; avatarUrl = g.photo_100 || null; }
        else   { title = `Сообщество`; }
      }
      return {
        externalId: String(peer.id),
        title,
        avatarUrl,
        lastMessage: it.last_message ? composeVkBody({
          text:          it.last_message.text,
          attachments:   it.last_message.attachments,
          geo:           it.last_message.geo,
          fwd_messages:  it.last_message.fwd_messages,
          reply_message: it.last_message.reply_message
        }) : '',
        lastTs: it.last_message ? it.last_message.date * 1000 : null,
        unread: conv.unread_count || 0
      };
    });
  }

  async loadHistory(peerId, count = 100) {
    if (!this.vk || !this.connected) return [];
    const res = await this.vk.api.messages.getHistory({
      peer_id: Number(peerId), count, extended: 1
    });
    const items = (res.items || []).slice().reverse();
    const profiles = res.profiles || [];
    const groups   = res.groups   || [];

    // Resolve missing sender profiles in batch (VK only includes a subset)
    const missing = [...new Set(items
      .map(m => m.from_id)
      .filter(id => id > 0 && !profiles.find(p => p.id === id)))];
    if (missing.length) {
      try {
        const extra = await this.vk.api.users.get({
          user_ids: missing.join(','), fields: 'photo_100'
        });
        profiles.push(...extra);
      } catch (err) { logger.warn('users.get for history failed', err.message); }
    }
    const resolveSender = (fromId) => {
      if (fromId > 0) {
        const p = profiles.find(p => p.id === fromId);
        if (p) return { name: `${p.first_name} ${p.last_name}`, avatar: realAvatar(p.photo_100) };
        return { name: `Пользователь VK #${fromId}`, avatar: null };
      }
      if (fromId < 0) {
        const g = groups.find(g => g.id === Math.abs(fromId));
        if (g) return { name: g.name, avatar: realAvatar(g.photo_100) };
        return { name: 'Сообщество', avatar: null };
      }
      return { name: null, avatar: null };
    };

    return items.map(m => {
      const n = normalizeVkMessage(m, profiles, groups);
      const s = resolveSender(m.from_id);
      return {
        externalId: String(m.id),
        direction: m.out ? 'out' : 'in',
        body: n.body,
        attachments: n.attachments,
        reply_to_text: n.reply_to_text,
        reply_to_author: n.reply_to_author,
        sender_name: m.out ? null : s.name,
        sender_avatar: m.out ? null : s.avatar,
        ts: (m.date || 0) * 1000
      };
    });
  }

  async sendMessage(peerId, text) {
    if (!this.vk || !this.connected) throw new Error('VK not connected');
    const random_id = Math.floor(Math.random() * 1e9);
    await this.vk.api.messages.send({ peer_id: Number(peerId), message: String(text), random_id });
    return { ok: true };
  }

  async sendFile(peerId, filePath, caption = '') {
    if (!this.vk || !this.connected) throw new Error('VK not connected');
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    const isImage = ['png','jpg','jpeg','gif','webp','bmp'].includes(ext);
    const isVideo = ['mp4','mov','webm','mkv','avi'].includes(ext);
    let attachment;
    if (isImage) {
      const photo = await this.vk.upload.messagePhoto({ peer_id: Number(peerId), source: { value: filePath } });
      attachment = `photo${photo.ownerId}_${photo.id}`;
    } else if (isVideo) {
      const video = await this.vk.upload.video({ source: { value: filePath } });
      attachment = `video${video.ownerId}_${video.id}`;
    } else {
      const doc = await this.vk.upload.messageDocument({ peer_id: Number(peerId), source: { value: filePath } });
      attachment = `doc${doc.ownerId}_${doc.id}`;
    }
    const random_id = Math.floor(Math.random() * 1e9);
    await this.vk.api.messages.send({
      peer_id: Number(peerId),
      message: String(caption || ''),
      attachment,
      random_id
    });
    return { ok: true };
  }

  async disconnect() {
    if (this.vk) { try { await this.vk.updates.stop(); } catch (_) {} this.vk = null; }
    this.connected = false;
    this.emit('status', { connected: false });
  }

  async logout() { await this.disconnect(); credentialsManager.clearVk(); }

  status() { return { connected: this.connected }; }
}

module.exports = new VkService();
