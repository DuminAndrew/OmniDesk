const fs = require('fs');
const { safeStorage } = require('electron');
const paths = require('../utils/paths');
const logger = require('../utils/logger');

function writeEncrypted(file, plain) {
  paths.sessionsDir();
  if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(String(plain));
    fs.writeFileSync(file, buf);
  } else {
    logger.warn('safeStorage unavailable — falling back to plain file', file);
    fs.writeFileSync(file, String(plain), 'utf8');
  }
}

function readEncrypted(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const buf = fs.readFileSync(file);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    return buf.toString('utf8');
  } catch (err) {
    logger.error('Failed to decrypt', file, err.message);
    return null;
  }
}

function clearFile(file) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// ───── Telegram credentials ─────────────────────────────────────────
function saveTelegramConfig({ apiId, apiHash }) {
  writeEncrypted(paths.telegramConfigFile(), JSON.stringify({ apiId, apiHash }));
}
function loadTelegramConfig() {
  const raw = readEncrypted(paths.telegramConfigFile());
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function saveTelegramSession(sessionStr) {
  writeEncrypted(paths.telegramSessionFile(), sessionStr || '');
}
function loadTelegramSession() {
  return readEncrypted(paths.telegramSessionFile()) || '';
}
function clearTelegram() {
  clearFile(paths.telegramConfigFile());
  clearFile(paths.telegramSessionFile());
}

// ───── VK token ─────────────────────────────────────────────────────
function saveVkToken(token) {
  writeEncrypted(paths.vkTokenFile(), token);
}
function loadVkToken() {
  return readEncrypted(paths.vkTokenFile());
}
function clearVk() {
  clearFile(paths.vkTokenFile());
}

// ───── Proxy config ─────────────────────────────────────────────────
// shape: { type: 'mtproxy'|'socks5'|'none', host, port, secret?, username?, password? }
function saveProxy(cfg) {
  writeEncrypted(paths.proxyConfigFile(), JSON.stringify(cfg || { type: 'none' }));
}
function loadProxy() {
  const raw = readEncrypted(paths.proxyConfigFile());
  if (!raw) return { type: 'none' };
  try { return JSON.parse(raw); } catch { return { type: 'none' }; }
}
function clearProxy() {
  clearFile(paths.proxyConfigFile());
}

module.exports = {
  saveTelegramConfig, loadTelegramConfig,
  saveTelegramSession, loadTelegramSession,
  clearTelegram,
  saveVkToken, loadVkToken, clearVk,
  saveProxy, loadProxy, clearProxy
};
