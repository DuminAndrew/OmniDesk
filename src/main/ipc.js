const { ipcMain, shell, clipboard, BrowserWindow, session } = require('electron');
const path = require('path');

const tg = require('./services/telegramService');
const vk = require('./services/vkService');
const whisper = require('./services/whisperService');
const credentials = require('./services/credentialsManager');
const { getDb } = require('./db/database');

const clientsRepo = require('./db/repositories/clientsRepo');
const chatsRepo = require('./db/repositories/chatsRepo');
const messagesRepo = require('./db/repositories/messagesRepo');
const notesRepo = require('./db/repositories/notesRepo');
const tagsRepo = require('./db/repositories/tagsRepo');
const tasksRepo = require('./db/repositories/tasksRepo');

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

function register({ onWebContentsSend, mainWindow }) {
  function send(channel, payload) {
    const w = mainWindow && mainWindow();
    if (w) w.webContents.send(channel, payload);
  }

  // ─── Onboarding / status ─────────────────────────────────────────────
  ipcMain.handle('app:status', safe(async () => ({
    telegram: tg.status(),
    vk: vk.status(),
    hasTelegramSession: !!credentials.loadTelegramSession(),
    hasVkToken: !!credentials.loadVkToken(),
    proxy: credentials.loadProxy()
  })));

  ipcMain.handle('app:openExternal', safe(async (url) => { await shell.openExternal(url); return true; }));

  ipcMain.handle('app:copy', safe(async (text) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  }));

  // Open my.telegram.org inside a clean Electron BrowserWindow
  // (separate session = no third-party cookies, sidesteps the "ERROR" bug)
  ipcMain.handle('app:openTelegramOrg', safe(async () => {
    const ses = session.fromPartition('persist:tg-org', { cache: true });
    const win = new BrowserWindow({
      width: 1100, height: 800,
      title: 'my.telegram.org · OmniDesk',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:tg-org',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    win.removeMenu();
    await win.loadURL('https://my.telegram.org/');
    return true;
  }));

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
  ipcMain.handle('chats:list',     safe(async (filter) => chatsRepo.list(filter || {})));
  ipcMain.handle('chats:markRead', safe(async ({ id }) => { chatsRepo.markRead(id); return true; }));
  ipcMain.handle('chats:togglePin', safe(async ({ id }) => chatsRepo.togglePin(id)));
  ipcMain.handle('chats:syncDialogs', safe(async () => {
    const tasks = [];
    if (tg.status().connected) tasks.push(tg._seedDialogs().catch(() => {}));
    if (vk.status().connected) tasks.push(vk._seedDialogs().catch(() => {}));
    await Promise.all(tasks);
    return true;
  }));
  ipcMain.handle('chats:attachClient', safe(async ({ chatId, clientId }) => chatsRepo.attachClient(chatId, clientId)));
  ipcMain.handle('messages:list',  safe(async ({ chatId }) => messagesRepo.listByChat(chatId)));
  ipcMain.handle('media:download', safe(async ({ source, externalChatId, msgId, kind, ext }) => {
    if (source !== 'tg') throw new Error('Only TG media download is implemented');
    return tg.downloadMedia({ externalChatId, msgId, kind, ext: ext || 'bin' });
  }));
  ipcMain.handle('messages:loadHistory', safe(async ({ chatId, limit = 100 }) => {
    const chat = chatsRepo.get(chatId);
    if (!chat) throw new Error('Chat not found');
    let history = [];
    if (chat.source === 'vk' && vk.status().connected) {
      history = await vk.loadHistory(chat.external_id, limit);
    } else if (chat.source === 'tg' && tg.status().connected) {
      history = await tg.loadHistory(chat.external_id, limit);
    }
    for (const h of history) {
      messagesRepo.addOrEnrich({
        chat_id: chat.id,
        external_id: h.externalId,
        direction: h.direction,
        body: h.body,
        ts: h.ts,
        attachments: h.attachments,
        reply_to_text: h.reply_to_text,
        reply_to_author: h.reply_to_author,
        sender_name: h.sender_name,
        sender_avatar: h.sender_avatar
      });
    }
    return messagesRepo.listByChat(chat.id);
  }));

  // ─── CRM (clients) ──────────────────────────────────────────────────
  ipcMain.handle('clients:list',   safe(async (filter) => clientsRepo.list(filter || {})));
  ipcMain.handle('clients:create', safe(async (data) => clientsRepo.create(data)));
  ipcMain.handle('clients:update', safe(async ({ id, ...patch }) => clientsRepo.update(id, patch)));
  ipcMain.handle('clients:remove', safe(async ({ id }) => clientsRepo.remove(id)));
  ipcMain.handle('clients:get',    safe(async ({ id }) => clientsRepo.get(id)));
  ipcMain.handle('clients:listChats', safe(async ({ id }) => clientsRepo.listChats(id)));
  ipcMain.handle('clients:createFromChat', safe(async ({ chatId }) => {
    const chat = chatsRepo.get(chatId);
    if (!chat) throw new Error('Chat not found');
    const link = chat.source === 'vk'
      ? `https://vk.com/id${chat.external_id}`
      : `https://t.me/${chat.external_id}`;
    const client = clientsRepo.create({
      display_name: chat.title || 'Без имени',
      [chat.source === 'vk' ? 'vk_link' : 'tg_link']: link,
      avatar_url: chat.avatar_url || null,
      status: 'new'
    });
    chatsRepo.attachClient(chat.id, client.id);
    return client;
  }));

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

  // ─── Tasks ─────────────────────────────────────────────────────────
  ipcMain.handle('tasks:list',           safe(async (filter) => tasksRepo.list(filter || {})));
  ipcMain.handle('tasks:get',            safe(async ({ id }) => tasksRepo.get(id)));
  ipcMain.handle('tasks:create',         safe(async (data) => tasksRepo.create(data)));
  ipcMain.handle('tasks:update',         safe(async ({ id, ...patch }) => tasksRepo.update(id, patch)));
  ipcMain.handle('tasks:toggleComplete', safe(async ({ id }) => tasksRepo.toggleComplete(id)));
  ipcMain.handle('tasks:remove',         safe(async ({ id }) => tasksRepo.remove(id)));
  ipcMain.handle('tasks:counts',         safe(async () => tasksRepo.counts()));

  // ─── Whisper / voice transcription ─────────────────────────────────
  ipcMain.handle('whisper:status', safe(async () => whisper.status()));
  ipcMain.handle('whisper:downloadModel', safe(async () => {
    const onProgress = (received, total) => send('whisper:progress', {
      stage: 'model', received, total
    });
    const onProgressBin = (received, total) => send('whisper:progress', {
      stage: 'binary', received, total
    });
    // Always run downloadBinary — internally it skips if whisper-cli.exe
    // already exists, but DOES delete the deprecated main.exe stub from
    // earlier installs and re-download the proper binary.
    await whisper.downloadBinary(onProgressBin);
    if (!whisper.status().modelReady) await whisper.downloadModel(onProgress);
    send('whisper:progress', { stage: 'done' });
    return whisper.status();
  }));
  ipcMain.handle('whisper:transcribe', safe(async ({ wavBuffer, language = 'ru', messageId = null }) => {
    const text = await whisper.transcribe({ wavBuffer, language });
    if (messageId) {
      getDb().prepare('UPDATE messages SET transcript = ? WHERE id = ?').run(text, messageId);
    }
    return { text };
  }));
  ipcMain.handle('whisper:saveTranscript', safe(async ({ messageId, text }) => {
    getDb().prepare('UPDATE messages SET transcript = ? WHERE id = ?').run(text || null, messageId);
    return true;
  }));
}

module.exports = { register };
