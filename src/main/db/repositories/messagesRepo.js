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

function listByChat(chatId, { limit = 500 } = {}) {
  return getDb()
    .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY ts ASC LIMIT ?')
    .all(chatId, limit)
    .map(inflate);
}

function add(payload) {
  const {
    chat_id, external_id = null, direction, body, ts = Date.now(),
    attachments = null, reply_to_text = null, reply_to_author = null,
    sender_name = null, sender_avatar = null
  } = payload;
  const att = attachments && attachments.length ? JSON.stringify(attachments) : null;
  const info = getDb()
    .prepare(`INSERT INTO messages(chat_id, external_id, direction, body, ts, attachments, reply_to_text, reply_to_author, sender_name, sender_avatar)
              VALUES (@chat_id, @external_id, @direction, @body, @ts, @att, @reply_to_text, @reply_to_author, @sender_name, @sender_avatar)`)
    .run({ chat_id, external_id, direction, body, ts, att, reply_to_text, reply_to_author, sender_name, sender_avatar });
  return inflate(getDb().prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid));
}

/**
 * Insert or enrich. If a message with same (chat_id, external_id) already
 * exists, update its body / attachments / reply / sender info from the new
 * payload (so re-loading history can repair messages stored before the
 * attachment-extraction code existed). Returns the row (existing or new).
 */
function addOrEnrich(payload) {
  const { chat_id, external_id } = payload;
  if (external_id == null) return add(payload);

  const existing = getDb()
    .prepare('SELECT * FROM messages WHERE chat_id = ? AND external_id = ?')
    .get(chat_id, String(external_id));
  if (!existing) return add(payload);

  const newAtt = payload.attachments && payload.attachments.length
    ? JSON.stringify(payload.attachments) : null;
  getDb().prepare(`UPDATE messages SET
      body            = COALESCE(@body, body),
      attachments     = COALESCE(@att, attachments),
      reply_to_text   = COALESCE(@reply_to_text, reply_to_text),
      reply_to_author = COALESCE(@reply_to_author, reply_to_author),
      sender_name     = COALESCE(@sender_name, sender_name),
      sender_avatar   = COALESCE(@sender_avatar, sender_avatar)
    WHERE id = @id`).run({
      id: existing.id,
      body: payload.body || null,
      att: newAtt,
      reply_to_text: payload.reply_to_text || null,
      reply_to_author: payload.reply_to_author || null,
      sender_name: payload.sender_name || null,
      sender_avatar: payload.sender_avatar || null
    });
  return inflate(getDb().prepare('SELECT * FROM messages WHERE id = ?').get(existing.id));
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

module.exports = { listByChat, add, addUnique, addOrEnrich };
