const path = require('path');
const { BrowserWindow, shell } = require('electron');

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0F1115',
    title: 'OmniDesk',
    icon: path.join(__dirname, '..', '..', '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Tray "minimize to tray" behavior — hide instead of close
  mainWindow.on('close', (event) => {
    if (!mainWindow._allowClose) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  return mainWindow;
}

function getMainWindow() { return mainWindow; }

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApp() {
  if (mainWindow) mainWindow._allowClose = true;
  const { app } = require('electron');
  app.quit();
}

module.exports = { createMainWindow, getMainWindow, showMainWindow, quitApp };
