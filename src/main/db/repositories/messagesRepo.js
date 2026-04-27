const { getDb } = require('../database');

function listByChat(chatId, { limit = 200 } = {}) {
  return getDb()
    .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY ts ASC LIMIT ?')
    .all(chatId, limit);
}

function add({ chat_id, external_id = null, direction, body, ts = Date.now() }) {
  const info = getDb()
    .prepare(`INSERT INTO messages(chat_id, external_id, direction, body, ts)
              VALUES (@chat_id, @external_id, @direction, @body, @ts)`)
    .run({ chat_id, external_id, direction, body, ts });
  return getDb().prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { listByChat, add };
