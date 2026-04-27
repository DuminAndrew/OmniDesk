/**
 * Wires telegramService + vkService events into the database (chats, messages)
 * and emits unified 'inbox:newMessage' to the renderer + native notification.
 */
const tg = require('./telegramService');
const vk = require('./vkService');
const notify = require('./notificationService');
const chatsRepo = require('../db/repositories/chatsRepo');
const messagesRepo = require('../db/repositories/messagesRepo');
const logger = require('../utils/logger');

function init({ onNewMessage, onAvatarReady }) {
  const handle = (payload) => {
    try {
      const chat = chatsRepo.upsert({
        source: payload.source,
        external_id: payload.externalChatId,
        title: payload.title,
        avatar_url: payload.avatarUrl || null,
        last_message: payload.body,
        last_ts: payload.ts,
        unreadInc: payload.direction === 'in' ? 1 : 0
      });

      const msg = messagesRepo.addUnique({
        chat_id: chat.id,
        external_id: payload.externalId,
        direction: payload.direction,
        body: payload.body,
        ts: payload.ts,
        attachments: payload.attachments || null,
        reply_to_text: payload.reply_to_text || null,
        reply_to_author: payload.reply_to_author || null
      });

      if (payload.direction === 'in') {
        notify.show({
          title: `OmniDesk · ${payload.source === 'tg' ? 'Telegram' : 'ВКонтакте'}`,
          body: `${payload.title || ''}: ${payload.body.slice(0, 120)}`
        });
      }

      onNewMessage && onNewMessage({ chat, message: msg });
    } catch (err) {
      logger.error('inboxAggregator handle failed', err.message);
    }
  };

  const handleAvatar = (payload) => {
    try {
      chatsRepo.upsert({
        source: payload.source,
        external_id: payload.externalChatId,
        title: null,
        avatar_url: payload.avatarUrl,
        last_message: null,
        last_ts: null,
        unreadInc: 0
      });
      onAvatarReady && onAvatarReady(payload);
    } catch (_) {}
  };
  tg.on('avatar:ready', handleAvatar);
  vk.on('avatar:ready', handleAvatar);

  tg.on('message', handle);
  vk.on('message', handle);

  // Seed events: known dialogs from initial sync (no notification, no message row)
  const handleSeed = (payload) => {
    try {
      chatsRepo.upsert({
        source: payload.source,
        external_id: payload.externalChatId,
        title: payload.title,
        avatar_url: payload.avatarUrl || null,
        last_message: payload.body,
        last_ts: payload.ts,
        unreadInc: 0
      });
    } catch (err) {
      logger.error('seed failed', err.message);
    }
  };
  const handleSeedComplete = () => {
    onNewMessage && onNewMessage({});
  };
  tg.on('seed', handleSeed);
  vk.on('seed', handleSeed);
  tg.on('seedComplete', handleSeedComplete);
  vk.on('seedComplete', handleSeedComplete);
}

module.exports = { init };
