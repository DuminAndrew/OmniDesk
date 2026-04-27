const { app } = require('electron');
const path = require('path');

const APP_USER_MODEL_ID = 'com.omnidesk.app';

// Single instance lock — second .exe launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId(APP_USER_MODEL_ID);

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

app.whenReady().then(async () => {
  try {
    // Ensure DB is initialized before IPC/services touch it
    getDb();
  } catch (err) {
    logger.error('DB init failed', err.message);
  }

  createMainWindow();
  buildTray();

  ipc.register({});

  // Wire inbox events → DB → notify renderer
  inboxAggregator.init({
    onNewMessage: (payload) => {
      const w = getMainWindow();
      if (w) w.webContents.send('inbox:newMessage', payload);
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
