const { getDb } = require('../database');

function inflate(row) {
  if (!row) return row;
  if (row.attachments && typeof row.attachments === 'string') {
    try { row.attachments = JSON.parse(row.attachments); } catch { row.attachments = []; }
  } else {
    row.attachments = row.attachments || [];
  }
  return row;
}

function listByChat(chatId, { limit = 300 } = {}) {
  return getDb()
    .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY ts ASC LIMIT ?')
    .all(chatId, limit)
    .map(inflate);
}

function add({
  chat_id, external_id = null, direction, body, ts = Date.now(),
  attachments = null, reply_to_text = null, reply_to_author = null
}) {
  const att = attachments && attachments.length ? JSON.stringify(attachments) : null;
  const info = getDb()
    .prepare(`INSERT INTO messages(chat_id, external_id, direction, body, ts, attachments, reply_to_text, reply_to_author)
              VALUES (@chat_id, @external_id, @direction, @body, @ts, @att, @reply_to_text, @reply_to_author)`)
    .run({ chat_id, external_id, direction, body, ts, att, reply_to_text, reply_to_author });
  return inflate(getDb().prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid));
}

function addUnique(payload) {
  const { chat_id, external_id } = payload;
  if (external_id != null) {
    const existing = getDb()
      .prepare('SELECT id FROM messages WHERE chat_id = ? AND external_id = ?')
      .get(chat_id, String(external_id));
    if (existing) return null;
  }
  return add(payload);
}

module.exports = { listByChat, add, addUnique };
