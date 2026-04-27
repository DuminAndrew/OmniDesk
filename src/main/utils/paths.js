const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function ensure(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const userData = () => app.getPath('userData');

module.exports = {
  userData,
  dbPath: () => path.join(userData(), 'database.sqlite'),
  sessionsDir: () => ensure(path.join(userData(), 'sessions')),
  logsDir: () => ensure(path.join(userData(), 'logs')),
  cacheDir: () => ensure(path.join(userData(), 'cache')),
  avatarsDir: () => ensure(path.join(userData(), 'cache', 'avatars')),
  telegramSessionFile: () => path.join(userData(), 'sessions', 'telegram.session'),
  telegramConfigFile: () => path.join(userData(), 'sessions', 'telegram.config'),
  vkTokenFile: () => path.join(userData(), 'sessions', 'vk.token'),
  proxyConfigFile: () => path.join(userData(), 'sessions', 'proxy.config')
};
