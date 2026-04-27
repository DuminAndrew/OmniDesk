const { ipcMain, shell } = require('electron');

const tg = require('./services/telegramService');
const vk = require('./services/vkService');
const credentials = require('./services/credentialsManager');

const clientsRepo = require('./db/repositories/clientsRepo');
const chatsRepo = require('./db/repositories/chatsRepo');
const messagesRepo = require('./db/repositories/messagesRepo');
const notesRepo = require('./db/repositories/notesRepo');
const tagsRepo = require('./db/repositories/tagsRepo');

const logger = require('./utils/logger');

function safe(fn) {
  return async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      logger.error('IPC error', err.message, err.stack);
      return { ok: false, error: err.message };
    }
  };
}

function register({ onWebContentsSend }) {
  // ─── Onboarding / status ─────────────────────────────────────────────
  ipcMain.handle('app:status', safe(async () => ({
    telegram: tg.status(),
    vk: vk.status(),
    hasTelegramSession: !!credentials.loadTelegramSession(),
    hasVkToken: !!credentials.loadVkToken(),
    proxy: credentials.loadProxy()
  })));

  ipcMain.handle('app:openExternal', safe(async (url) => { await shell.openExternal(url); return true; }));

  // ─── Proxy ──────────────────────────────────────────────────────────
  ipcMain.handle('proxy:get',  safe(async () => credentials.loadProxy()));
  ipcMain.handle('proxy:save', safe(async (cfg) => { credentials.saveProxy(cfg); return cfg; }));
  ipcMain.handle('proxy:clear', safe(async () => { credentials.clearProxy(); return true; }));

  // ─── Telegram login flow ────────────────────────────────────────────
  ipcMain.handle('tg:startLogin', safe(async ({ apiId, apiHash, phoneNumber }) => {
    const proxyCfg = credentials.loadProxy();
    return tg.startLogin({ apiId, apiHash, phoneNumber, proxyCfg });
  }));
  ipcMain.handle('tg:submitCode',     safe(async ({ code })     => tg.submitCode(code)));
  ipcMain.handle('tg:submitPassword', safe(async ({ password }) => tg.submitPassword(password)));
  ipcMain.handle('tg:logout',         safe(async () => tg.logout()));
  ipcMain.handle('tg:listDialogs',    safe(async () => tg.listDialogs()));
  ipcMain.handle('tg:sendMessage',    safe(async ({ chatId, text }) => tg.sendMessage(chatId, text)));

  // ─── VK ─────────────────────────────────────────────────────────────
  ipcMain.handle('vk:loginWithToken', safe(async ({ token }) => vk.loginWithToken(token)));
  ipcMain.handle('vk:logout',         safe(async () => vk.logout()));
  ipcMain.handle('vk:listDialogs',    safe(async () => vk.listDialogs()));
  ipcMain.handle('vk:sendMessage',    safe(async ({ chatId, text }) => vk.sendMessage(chatId, text)));

  // ─── Unified send (resolves source from chat row) ───────────────────
  ipcMain.handle('inbox:sendMessage', safe(async ({ chatRowId, text }) => {
    const chat = chatsRepo.get(chatRowId);
    if (!chat) throw new Error('Chat not found');
    if (chat.source === 'tg') await tg.sendMessage(chat.external_id, text);
    else if (chat.source === 'vk') await vk.sendMessage(chat.external_id, text);
    else throw new Error('Unknown chat source');
    const msg = messagesRepo.add({
      chat_id: chat.id, direction: 'out', body: text, ts: Date.now()
    });
    chatsRepo.upsert({
      source: chat.source, external_id: chat.external_id, title: chat.title,
      last_message: text, last_ts: Date.now()
    });
    return msg;
  }));

  // ─── Chats / messages ───────────────────────────────────────────────
  ipcMain.handle('chats:list',     safe(async () => chatsRepo.list()));
  ipcMain.handle('chats:markRead', safe(async ({ id }) => { chatsRepo.markRead(id); return true; }));
  ipcMain.handle('chats:attachClient', safe(async ({ chatId, clientId }) => chatsRepo.attachClient(chatId, clientId)));
  ipcMain.handle('messages:list',  safe(async ({ chatId }) => messagesRepo.listByChat(chatId)));

  // ─── CRM (clients) ──────────────────────────────────────────────────
  ipcMain.handle('clients:list',   safe(async (filter) => clientsRepo.list(filter || {})));
  ipcMain.handle('clients:create', safe(async (data) => clientsRepo.create(data)));
  ipcMain.handle('clients:update', safe(async ({ id, ...patch }) => clientsRepo.update(id, patch)));
  ipcMain.handle('clients:remove', safe(async ({ id }) => clientsRepo.remove(id)));
  ipcMain.handle('clients:get',    safe(async ({ id }) => clientsRepo.get(id)));

  // ─── Notes ──────────────────────────────────────────────────────────
  ipcMain.handle('notes:listForClient', safe(async ({ clientId }) => notesRepo.listForClient(clientId)));
  ipcMain.handle('notes:listForChat',   safe(async ({ chatId })   => notesRepo.listForChat(chatId)));
  ipcMain.handle('notes:create',        safe(async (data) => notesRepo.create(data)));
  ipcMain.handle('notes:update',        safe(async ({ id, body }) => notesRepo.update(id, body)));
  ipcMain.handle('notes:remove',        safe(async ({ id }) => notesRepo.remove(id)));

  // ─── Tags ───────────────────────────────────────────────────────────
  ipcMain.handle('tags:list',          safe(async () => tagsRepo.list()));
  ipcMain.handle('tags:create',        safe(async (data) => tagsRepo.create(data)));
  ipcMain.handle('tags:remove',        safe(async ({ id }) => tagsRepo.remove(id)));
  ipcMain.handle('tags:attach',        safe(async ({ clientId, tagId }) => { tagsRepo.attach(clientId, tagId); return true; }));
  ipcMain.handle('tags:detach',        safe(async ({ clientId, tagId }) => { tagsRepo.detach(clientId, tagId); return true; }));
  ipcMain.handle('tags:listForClient', safe(async ({ clientId }) => tagsRepo.listForClient(clientId)));
}

module.exports = { register };
