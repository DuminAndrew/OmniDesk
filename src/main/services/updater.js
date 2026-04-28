/**
 * OTA updater wrapper around electron-updater. Pulls from
 * github.com/DuminAndrew/OmniDesk releases (configured in electron-builder.yml).
 *
 * Lifecycle:
 *   idle → checking → up-to-date | downloading → ready
 *                                              \→ error
 */
const { EventEmitter } = require('events');
const { autoUpdater } = require('electron-updater');
const { app } = require('electron');
const logger = require('../utils/logger');

class UpdaterService extends EventEmitter {
  constructor() {
    super();
    this.state = {
      status: 'idle',
      currentVersion: app.getVersion(),
      newVersion: null,
      progress: 0,
      error: null
    };
    autoUpdater.logger = {
      info:  (...a) => logger.info('[updater]', ...a),
      warn:  (...a) => logger.warn('[updater]', ...a),
      error: (...a) => logger.error('[updater]', ...a),
      debug: () => {}
    };
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    this._wire();
  }

  _wire() {
    autoUpdater.on('checking-for-update', () => this._patch({ status: 'checking' }));
    autoUpdater.on('update-available',     (info) => this._patch({ status: 'downloading', newVersion: info.version, progress: 0 }));
    autoUpdater.on('update-not-available', (info) => this._patch({ status: 'up-to-date',  newVersion: info.version }));
    autoUpdater.on('download-progress',    (p) => this._patch({ status: 'downloading', progress: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded',    (info) => this._patch({ status: 'ready', newVersion: info.version, progress: 100 }));
    autoUpdater.on('error', (err) => {
      logger.error('updater error', err?.message || err);
      this._patch({ status: 'error', error: err?.message || String(err) });
    });
  }

  _patch(p) {
    Object.assign(this.state, p);
    this.emit('state', this.state);
  }

  /** Triggered manually OR on app startup */
  async check({ silent = true } = {}) {
    try {
      // Skip in dev mode (electron-updater bails out anyway)
      if (!app.isPackaged) {
        this._patch({ status: 'up-to-date', error: silent ? null : 'Доступно только в установленной версии' });
        return this.state;
      }
      await autoUpdater.checkForUpdates();
    } catch (err) {
      logger.error('manual update check failed', err.message);
      this._patch({ status: 'error', error: err.message });
    }
    return this.state;
  }

  install() {
    if (this.state.status !== 'ready') return false;
    // isSilent=false — show classic NSIS UI; isForceRunAfter=true — relaunch
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return true;
  }

  getState() { return this.state; }
}

module.exports = new UpdaterService();
