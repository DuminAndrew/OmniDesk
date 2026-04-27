const { Tray, Menu, nativeImage } = require('electron');
const { showMainWindow, quitApp, iconPath } = require('./mainWindow');

let tray = null;

function buildTray() {
  if (tray) return tray;
  const image = nativeImage.createFromPath(iconPath());
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
