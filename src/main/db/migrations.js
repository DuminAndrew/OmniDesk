const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS clients (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  link         TEXT,
  status       TEXT NOT NULL DEFAULT 'new',  -- new | in_progress | closed | rejected
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,                -- 'tg' | 'vk'
  external_id   TEXT NOT NULL,                -- chatId / peerId in source system
  title         TEXT NOT NULL,
  avatar_url    TEXT,
  client_id     INTEGER,
  last_message  TEXT,
  last_ts       INTEGER,
  unread_count  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(source, external_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id      INTEGER NOT NULL,
  external_id  TEXT,
  direction    TEXT NOT NULL,                  -- 'in' | 'out'
  body         TEXT NOT NULL,
  ts           INTEGER NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, ts DESC);

CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER,
  chat_id     INTEGER,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_id)   REFERENCES chats(id)   ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#4568DC'
);

CREATE TABLE IF NOT EXISTS client_tags (
  client_id INTEGER NOT NULL,
  tag_id    INTEGER NOT NULL,
  PRIMARY KEY (client_id, tag_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)    REFERENCES tags(id)    ON DELETE CASCADE
);
`;

function applyMigrations(db) {
  db.exec(SCHEMA);
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get();
  if (!row) {
    db.prepare('INSERT INTO schema_version(version) VALUES (?)').run(1);
  }
}

module.exports = { applyMigrations };
