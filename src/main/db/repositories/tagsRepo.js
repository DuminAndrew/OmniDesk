const { getDb } = require('../database');

function list() {
  return getDb().prepare('SELECT * FROM tags ORDER BY name').all();
}

function create({ name, color = '#4568DC' }) {
  const info = getDb()
    .prepare('INSERT OR IGNORE INTO tags(name, color) VALUES (?, ?)')
    .run(name, color);
  return getDb().prepare('SELECT * FROM tags WHERE name = ?').get(name);
}

function remove(id) {
  getDb().prepare('DELETE FROM tags WHERE id = ?').run(id);
  return true;
}

function attach(clientId, tagId) {
  getDb().prepare('INSERT OR IGNORE INTO client_tags(client_id, tag_id) VALUES (?, ?)').run(clientId, tagId);
}

function detach(clientId, tagId) {
  getDb().prepare('DELETE FROM client_tags WHERE client_id = ? AND tag_id = ?').run(clientId, tagId);
}

function listForClient(clientId) {
  return getDb().prepare(`
    SELECT t.* FROM tags t
    INNER JOIN client_tags ct ON ct.tag_id = t.id
    WHERE ct.client_id = ?
    ORDER BY t.name
  `).all(clientId);
}

module.exports = { list, create, remove, attach, detach, listForClient };
