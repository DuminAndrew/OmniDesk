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

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

function applyMigrations(db) {
  db.exec(SCHEMA);
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get();
  if (!row) {
    db.prepare('INSERT INTO schema_version(version) VALUES (?)').run(1);
  }

  // v1 → v2: pin column
  if (!columnExists(db, 'chats', 'is_pinned')) {
    db.exec('ALTER TABLE chats ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0');
  }

  // v2 → v3: attachments JSON + reply metadata on messages
  if (!columnExists(db, 'messages', 'attachments')) {
    db.exec('ALTER TABLE messages ADD COLUMN attachments TEXT');
  }
  if (!columnExists(db, 'messages', 'reply_to_text')) {
    db.exec('ALTER TABLE messages ADD COLUMN reply_to_text TEXT');
  }
  if (!columnExists(db, 'messages', 'reply_to_author')) {
    db.exec('ALTER TABLE messages ADD COLUMN reply_to_author TEXT');
  }

  // v3 → v4: Unified contact card columns on clients
  if (!columnExists(db, 'clients', 'phone'))      db.exec('ALTER TABLE clients ADD COLUMN phone TEXT');
  if (!columnExists(db, 'clients', 'short_name')) db.exec('ALTER TABLE clients ADD COLUMN short_name TEXT');
  if (!columnExists(db, 'clients', 'vk_link'))    db.exec('ALTER TABLE clients ADD COLUMN vk_link TEXT');
  if (!columnExists(db, 'clients', 'tg_link'))    db.exec('ALTER TABLE clients ADD COLUMN tg_link TEXT');
  if (!columnExists(db, 'clients', 'avatar_url')) db.exec('ALTER TABLE clients ADD COLUMN avatar_url TEXT');
  if (!columnExists(db, 'clients', 'about'))      db.exec('ALTER TABLE clients ADD COLUMN about TEXT');

  // v4 → v5: Tasks
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    INTEGER,
      chat_id      INTEGER,
      title        TEXT NOT NULL,
      body         TEXT,
      due_at       INTEGER,
      priority     TEXT NOT NULL DEFAULT 'normal',  -- low | normal | high
      completed    INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (chat_id)   REFERENCES chats(id)   ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks(due_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_client    ON tasks(client_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
  `);

  // v5 → v6: voice transcription
  if (!columnExists(db, 'messages', 'transcript')) {
    db.exec('ALTER TABLE messages ADD COLUMN transcript TEXT');
  }

  // v6 → v7: per-message sender name (for groups / multi-user chats)
  if (!columnExists(db, 'messages', 'sender_name')) {
    db.exec('ALTER TABLE messages ADD COLUMN sender_name TEXT');
  }
  if (!columnExists(db, 'messages', 'sender_avatar')) {
    db.exec('ALTER TABLE messages ADD COLUMN sender_avatar TEXT');
  }
}

module.exports = { applyMigrations };
