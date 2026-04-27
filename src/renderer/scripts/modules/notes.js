import { tpl, $, $$, bind, clear, escapeHtml, fmtTime } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const api = window.omnidesk;

export async function renderNotes(host) {
  host.innerHTML = '';
  const view = tpl('tpl-view-notes');
  host.appendChild(view);

  const sel = bind(view, 'client-filter');
  const clientsRes = await api.clients.list({});
  for (const c of (clientsRes.data || [])) {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.display_name;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => refresh(view, sel.value));
  await refresh(view, '');
}

async function refresh(view, clientId) {
  const grid = bind(view, 'notes-grid');
  clear(grid);
  let notes = [];
  if (clientId) {
    const r = await api.notes.listForClient({ clientId: Number(clientId) });
    notes = r.data || [];
  } else {
    const clientsRes = await api.clients.list({});
    for (const c of (clientsRes.data || [])) {
      const r = await api.notes.listForClient({ clientId: c.id });
      notes.push(...(r.data || []).map(n => ({ ...n, _clientName: c.display_name })));
    }
    notes.sort((a, b) => b.updated_at - a.updated_at);
  }

  if (!notes.length) {
    grid.innerHTML = '<div class="muted">Нет заметок.</div>';
    return;
  }
  for (const n of notes) {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.innerHTML = `
      <div class="note-card__body">${escapeHtml(n.body)}</div>
      <div class="note-card__footer">
        <span>${escapeHtml(n._clientName || '')}</span>
        <span>${fmtTime(n.updated_at)}</span>
      </div>
      <div class="row" style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn--ghost" data-edit>Изм.</button>
        <button class="btn btn--danger" data-del>Удалить</button>
      </div>
    `;
    card.querySelector('[data-del]').addEventListener('click', async () => {
      await api.notes.remove({ id: n.id });
      toast('Удалено', 'success');
      refresh(view, clientId);
    });
    card.querySelector('[data-edit]').addEventListener('click', async () => {
      const next = prompt('Заметка:', n.body);
      if (next == null) return;
      await api.notes.update({ id: n.id, body: next });
      refresh(view, clientId);
    });
    grid.appendChild(card);
  }
}
