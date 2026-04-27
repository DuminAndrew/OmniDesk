const { getDb } = require('../database');

function list({ source = null } = {}) {
  let sql = 'SELECT * FROM chats';
  const params = {};
  if (source && source !== 'all') {
    sql += ' WHERE source = @source';
    params.source = source;
  }
  sql += ' ORDER BY is_pinned DESC, COALESCE(last_ts, 0) DESC';
  return getDb().prepare(sql).all(params);
}

function togglePin(id) {
  const cur = getDb().prepare('SELECT is_pinned FROM chats WHERE id = ?').get(id);
  if (!cur) return null;
  const next = cur.is_pinned ? 0 : 1;
  getDb().prepare('UPDATE chats SET is_pinned = ? WHERE id = ?').run(next, id);
  return get(id);
}

function getByExternal(source, externalId) {
  return getDb()
    .prepare('SELECT * FROM chats WHERE source = ? AND external_id = ?')
    .get(source, String(externalId));
}

function get(id) {
  return getDb().prepare('SELECT * FROM chats WHERE id = ?').get(id);
}

function upsert({ source, external_id, title, avatar_url = null, last_message = null, last_ts = null, unreadInc = 0 }) {
  const db = getDb();
  const existing = getByExternal(source, external_id);
  if (existing) {
    db.prepare(`UPDATE chats
                SET title       = COALESCE(@title, title),
                    avatar_url  = COALESCE(@avatar_url, avatar_url),
                    last_message= COALESCE(@last_message, last_message),
                    last_ts     = COALESCE(@last_ts, last_ts),
                    unread_count= unread_count + @unreadInc
                WHERE id = @id`)
      .run({ id: existing.id, title, avatar_url, last_message, last_ts, unreadInc });
    return get(existing.id);
  }
  const info = db.prepare(`INSERT INTO chats(source, external_id, title, avatar_url, last_message, last_ts, unread_count)
                           VALUES (@source, @external_id, @title, @avatar_url, @last_message, @last_ts, @unreadInc)`)
    .run({ source, external_id: String(external_id), title, avatar_url, last_message, last_ts, unreadInc });
  return get(info.lastInsertRowid);
}

function markRead(id) {
  getDb().prepare('UPDATE chats SET unread_count = 0 WHERE id = ?').run(id);
}

function attachClient(chatId, clientId) {
  getDb().prepare('UPDATE chats SET client_id = ? WHERE id = ?').run(clientId, chatId);
  return get(chatId);
}

module.exports = { list, get, getByExternal, upsert, markRead, attachClient, togglePin };
