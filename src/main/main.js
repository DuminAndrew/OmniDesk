const { app, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');

const APP_USER_MODEL_ID = 'com.omnidesk.app';

// Single instance lock — second .exe launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId(APP_USER_MODEL_ID);

// Privileged custom protocol for serving cached avatars & media to renderer.
// Registered BEFORE app.whenReady() per Electron docs.
protocol.registerSchemesAsPrivileged([{
  scheme: 'omnidesk',
  privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: false, corsEnabled: true }
}]);

const logger = require('./utils/logger');
const { createMainWindow, getMainWindow, showMainWindow } = require('./windows/mainWindow');
const { buildTray } = require('./windows/tray');
const ipc = require('./ipc');
const tg = require('./services/telegramService');
const vk = require('./services/vkService');
const inboxAggregator = require('./services/inboxAggregator');
const { getDb, closeDb } = require('./db/database');

app.on('second-instance', () => {
  showMainWindow();
});

function registerOmniDeskProtocol() {
  const paths = require('./utils/paths');
  // omnidesk://avatars/<file> → cache/avatars/<file>
  // omnidesk://media/<file>   → cache/media/<file>
  // omnidesk://voice/<file>   → cache/voice/<file>
  protocol.handle('omnidesk', async (req) => {
    try {
      const u = new URL(req.url);
      const sub = u.hostname; // avatars | media | voice
      const file = decodeURIComponent(u.pathname.replace(/^\//, ''));
      let dir;
      if (sub === 'avatars')      dir = paths.avatarsDir();
      else if (sub === 'media')   dir = paths.mediaDir();
      else if (sub === 'voice')   dir = paths.voiceDir();
      else return new Response('Bad scope', { status: 400 });
      const target = path.join(dir, file);
      if (!target.startsWith(dir)) return new Response('Forbidden', { status: 403 });
      if (!fs.existsSync(target)) return new Response('Not found', { status: 404 });
      const fileUrl = url.pathToFileURL(target).href;
      return net.fetch(fileUrl);
    } catch (err) {
      return new Response('Internal: ' + err.message, { status: 500 });
    }
  });
}

app.whenReady().then(async () => {
  try {
    // Ensure DB is initialized before IPC/services touch it
    getDb();
  } catch (err) {
    logger.error('DB init failed', err.message);
  }

  registerOmniDeskProtocol();

  createMainWindow();
  buildTray();

  ipc.register({});

  // Wire inbox events → DB → notify renderer
  inboxAggregator.init({
    onNewMessage: (payload) => {
      const w = getMainWindow();
      if (w) w.webContents.send('inbox:newMessage', payload);
    },
    onAvatarReady: (payload) => {
      const w = getMainWindow();
      if (w) w.webContents.send('inbox:avatarReady', payload);
    }
  });

  // Push status events to renderer
  const pushTg = (s) => { const w = getMainWindow(); if (w) w.webContents.send('tg:status', s); };
  const pushVk = (s) => { const w = getMainWindow(); if (w) w.webContents.send('vk:status', s); };
  tg.on('status', pushTg);
  vk.on('status', pushVk);
  tg.on('login:error',   (msg) => { const w = getMainWindow(); if (w) w.webContents.send('tg:loginEvent', { type: 'error',   message: msg }); });
  tg.on('login:success', ()    => { const w = getMainWindow(); if (w) w.webContents.send('tg:loginEvent', { type: 'success' }); });

  // Try to auto-reconnect using saved sessions
  tg.connectFromSession().catch((e) => logger.warn('TG auto-connect skipped', e.message));
  vk.connectFromToken().catch((e) => logger.warn('VK auto-connect skipped', e.message));

  logger.info('OmniDesk started, userData =', app.getPath('userData'));
});

app.on('window-all-closed', (e) => {
  // Stay alive in tray on Windows
  e.preventDefault();
});

app.on('before-quit', () => {
  closeDb();
});
