const { getDb } = require('../database');

const STATUSES = ['new', 'in_progress', 'closed', 'rejected'];

const COLUMNS = [
  'display_name', 'short_name', 'phone',
  'link', 'vk_link', 'tg_link',
  'avatar_url', 'about',
  'status'
];

function list({ status = null, search = null } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM clients';
  const where = [];
  const params = {};
  if (status) { where.push('status = @status'); params.status = status; }
  if (search) { where.push('(display_name LIKE @search OR phone LIKE @search OR short_name LIKE @search)'); params.search = `%${search}%`; }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY updated_at DESC';
  return db.prepare(sql).all(params);
}

function get(id) {
  return getDb().prepare('SELECT * FROM clients WHERE id = ?').get(id);
}

function create(data) {
  const now = Date.now();
  const safe = { status: 'new', ...data };
  if (!STATUSES.includes(safe.status)) safe.status = 'new';
  const cols = COLUMNS.filter(c => safe[c] !== undefined);
  const placeholders = cols.map(c => `@${c}`).join(',');
  const sql = `INSERT INTO clients(${cols.join(',')}, created_at, updated_at)
               VALUES (${placeholders}, @now, @now)`;
  const info = getDb().prepare(sql).run({ ...safe, now });
  return get(info.lastInsertRowid);
}

function update(id, patch) {
  const current = get(id);
  if (!current) return null;
  const next = { ...current, ...patch, updated_at: Date.now() };
  if (!STATUSES.includes(next.status)) next.status = current.status;
  const cols = COLUMNS.filter(c => c in next);
  const setSql = cols.map(c => `${c} = @${c}`).join(', ');
  getDb().prepare(`UPDATE clients SET ${setSql}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...next, id });
  return get(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM clients WHERE id = ?').run(id);
  return true;
}

function listChats(clientId) {
  return getDb().prepare('SELECT * FROM chats WHERE client_id = ? ORDER BY last_ts DESC').all(clientId);
}

module.exports = { list, get, create, update, remove, listChats, STATUSES };
