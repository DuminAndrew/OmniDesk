const { getDb } = require('../database');

const STATUSES = ['new', 'in_progress', 'closed', 'rejected'];

function list({ status = null, search = null } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM clients';
  const where = [];
  const params = {};
  if (status) { where.push('status = @status'); params.status = status; }
  if (search) { where.push('display_name LIKE @search'); params.search = `%${search}%`; }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY updated_at DESC';
  return db.prepare(sql).all(params);
}

function get(id) {
  return getDb().prepare('SELECT * FROM clients WHERE id = ?').get(id);
}

function create({ display_name, link = null, status = 'new' }) {
  const now = Date.now();
  const safeStatus = STATUSES.includes(status) ? status : 'new';
  const info = getDb()
    .prepare(`INSERT INTO clients(display_name, link, status, created_at, updated_at)
              VALUES (@display_name, @link, @status, @now, @now)`)
    .run({ display_name, link, status: safeStatus, now });
  return get(info.lastInsertRowid);
}

function update(id, patch) {
  const current = get(id);
  if (!current) return null;
  const next = { ...current, ...patch, updated_at: Date.now() };
  if (!STATUSES.includes(next.status)) next.status = current.status;
  getDb()
    .prepare(`UPDATE clients SET display_name=@display_name, link=@link, status=@status, updated_at=@updated_at WHERE id=@id`)
    .run(next);
  return get(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM clients WHERE id = ?').run(id);
  return true;
}

module.exports = { list, get, create, update, remove, STATUSES };
