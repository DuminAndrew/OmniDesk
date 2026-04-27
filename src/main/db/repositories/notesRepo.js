const { getDb } = require('../database');

function listForClient(clientId) {
  return getDb()
    .prepare('SELECT * FROM notes WHERE client_id = ? ORDER BY updated_at DESC')
    .all(clientId);
}

function listForChat(chatId) {
  return getDb()
    .prepare('SELECT * FROM notes WHERE chat_id = ? ORDER BY updated_at DESC')
    .all(chatId);
}

function create({ client_id = null, chat_id = null, body }) {
  const now = Date.now();
  const info = getDb()
    .prepare(`INSERT INTO notes(client_id, chat_id, body, created_at, updated_at)
              VALUES (@client_id, @chat_id, @body, @now, @now)`)
    .run({ client_id, chat_id, body, now });
  return getDb().prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid);
}

function update(id, body) {
  getDb().prepare('UPDATE notes SET body = ?, updated_at = ? WHERE id = ?').run(body, Date.now(), id);
  return getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id);
  return true;
}

module.exports = { listForClient, listForChat, create, update, remove };
