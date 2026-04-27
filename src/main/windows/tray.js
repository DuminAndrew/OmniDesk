const path = require('path');
const { Tray, Menu, nativeImage } = require('electron');
const { showMainWindow, quitApp } = require('./mainWindow');

let tray = null;

function buildTray() {
  if (tray) return tray;
  const iconPath = path.join(__dirname, '..', '..', '..', 'build', 'icon.ico');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('OmniDesk');
  const menu = Menu.buildFromTemplate([
    { label: 'Открыть OmniDesk', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Выход',            click: () => quitApp() }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => showMainWindow());
  tray.on('double-click', () => showMainWindow());
  return tray;
}

module.exports = { buildTray };
