/**
 * On-disk cache for Telegram avatars and media. Each item gets a stable file
 * name derived from its identifying tuple. The renderer accesses cached files
 * via the `omnidesk://` custom protocol (see main.js).
 */
const fs = require('fs');
const path = require('path');
const paths = require('../utils/paths');
const logger = require('../utils/logger');

function safe(name) { return String(name).replace(/[^a-zA-Z0-9._-]/g, '_'); }

function avatarFile(source, externalId) {
  return path.join(paths.avatarsDir(), `${source}-${safe(externalId)}.jpg`);
}
function avatarUrl(source, externalId) {
  return `omnidesk://avatars/${source}-${safe(externalId)}.jpg`;
}
function avatarExists(source, externalId) {
  return fs.existsSync(avatarFile(source, externalId));
}

function mediaFile(source, kind, externalChatId, msgId, ext) {
  return path.join(paths.mediaDir(), `${source}-${kind}-${safe(externalChatId)}-${safe(msgId)}.${ext}`);
}
function mediaUrl(source, kind, externalChatId, msgId, ext) {
  return `omnidesk://media/${source}-${kind}-${safe(externalChatId)}-${safe(msgId)}.${ext}`;
}
function mediaExists(source, kind, externalChatId, msgId, ext) {
  return fs.existsSync(mediaFile(source, kind, externalChatId, msgId, ext));
}

function writeBuffer(file, buffer) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
    return true;
  } catch (err) {
    logger.error('mediaCache.writeBuffer failed', file, err.message);
    return false;
  }
}

module.exports = {
  avatarFile, avatarUrl, avatarExists,
  mediaFile, mediaUrl, mediaExists,
  writeBuffer
};
