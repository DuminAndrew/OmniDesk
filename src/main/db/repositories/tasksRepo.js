const { getDb } = require('../database');

const PRIORITIES = ['low', 'normal', 'high'];

function list({ status = 'all', clientId = null, search = null } = {}) {
  let sql = `SELECT t.*, c.display_name AS client_name, c.avatar_url AS client_avatar
             FROM tasks t LEFT JOIN clients c ON c.id = t.client_id`;
  const where = [];
  const params = {};
  if (status === 'pending')   where.push('t.completed = 0');
  if (status === 'completed') where.push('t.completed = 1');
  if (status === 'overdue')   { where.push('t.completed = 0 AND t.due_at IS NOT NULL AND t.due_at < @now'); params.now = Date.now(); }
  if (status === 'today')     {
    const start = new Date(); start.setHours(0,0,0,0);
    const end   = new Date(); end.setHours(23,59,59,999);
    where.push('t.due_at BETWEEN @start AND @end');
    params.start = start.getTime(); params.end = end.getTime();
  }
  if (clientId) { where.push('t.client_id = @clientId'); params.clientId = clientId; }
  if (search)   { where.push('(t.title LIKE @search OR t.body LIKE @search)'); params.search = `%${search}%`; }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY t.completed ASC, COALESCE(t.due_at, 9999999999999) ASC, t.created_at DESC';
  return getDb().prepare(sql).all(params);
}

function get(id) {
  return getDb().prepare(`
    SELECT t.*, c.display_name AS client_name FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ?
  `).get(id);
}

function create({ title, body = null, client_id = null, chat_id = null, due_at = null, priority = 'normal' }) {
  if (!PRIORITIES.includes(priority)) priority = 'normal';
  const now = Date.now();
  const info = getDb().prepare(`
    INSERT INTO tasks(client_id, chat_id, title, body, due_at, priority, created_at, updated_at)
    VALUES (@client_id, @chat_id, @title, @body, @due_at, @priority, @now, @now)
  `).run({ client_id, chat_id, title, body, due_at, priority, now });
  return get(info.lastInsertRowid);
}

function update(id, patch) {
  const cur = get(id);
  if (!cur) return null;
  const next = { ...cur, ...patch, updated_at: Date.now() };
  if (!PRIORITIES.includes(next.priority)) next.priority = 'normal';
  getDb().prepare(`
    UPDATE tasks SET
      client_id = @client_id, chat_id = @chat_id,
      title = @title, body = @body,
      due_at = @due_at, priority = @priority,
      completed = @completed, completed_at = @completed_at,
      updated_at = @updated_at
    WHERE id = @id
  `).run({ ...next, id });
  return get(id);
}

function toggleComplete(id) {
  const cur = get(id);
  if (!cur) return null;
  const completed = cur.completed ? 0 : 1;
  return update(id, { completed, completed_at: completed ? Date.now() : null });
}

function remove(id) {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return true;
}

function counts() {
  const db = getDb();
  const now = Date.now();
  return {
    pending:   db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE completed = 0').get().c,
    overdue:   db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE completed = 0 AND due_at IS NOT NULL AND due_at < ?').get(now).c,
    today:     (() => {
      const s = new Date(); s.setHours(0,0,0,0);
      const e = new Date(); e.setHours(23,59,59,999);
      return db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE completed = 0 AND due_at BETWEEN ? AND ?').get(s.getTime(), e.getTime()).c;
    })(),
    completed: db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE completed = 1').get().c
  };
}

module.exports = { list, get, create, update, toggleComplete, remove, counts, PRIORITIES };
