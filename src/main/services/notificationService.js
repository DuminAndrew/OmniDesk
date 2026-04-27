const { Notification } = require('electron');
const logger = require('../utils/logger');

function show({ title = 'OmniDesk', body = '', silent = false } = {}) {
  if (!Notification.isSupported()) {
    logger.warn('Native notifications not supported');
    return;
  }
  try {
    const n = new Notification({ title, body, silent });
    n.show();
  } catch (err) {
    logger.error('Notification failed', err.message);
  }
}

module.exports = { show };
