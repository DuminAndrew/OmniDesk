import { tpl, $, $$, bind, clear, escapeHtml, statusLabel } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const api = window.omnidesk;

let currentStatus = '';

export async function renderCRM(host) {
  host.innerHTML = '';
  const view = tpl('tpl-view-crm');
  host.appendChild(view);

  $$('.filter', view).forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter', view).forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentStatus = btn.dataset.status;
      refreshGrid(view);
    });
  });

  $('[data-action="new-client"]', view).addEventListener('click', () => openClientEditor(null, () => refreshGrid(view)));

  await refreshGrid(view);
}

async function refreshGrid(view) {
  const res = await api.clients.list(currentStatus ? { status: currentStatus } : {});
  const grid = bind(view, 'client-grid');
  clear(grid);
  const items = res.data || [];
  if (!items.length) {
    grid.innerHTML = '<div class="muted">Нет клиентов. Нажмите «Новый клиент».</div>';
    return;
  }
  for (const c of items) {
    const tagsRes = await api.tags.listForClient({ clientId: c.id });
    const tags = (tagsRes.data || []).map(t => `<span class="tag-chip">${escapeHtml(t.name)}</span>`).join('');
    const card = document.createElement('div');
    card.className = 'client-card';
    const initial = (c.display_name || '?').trim().charAt(0).toUpperCase();
    card.innerHTML = `
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:6px">
        <div class="avatar" style="background: var(--gradient-bento); width: 48px; height: 48px; box-shadow: 0 0 0 2px rgba(255,107,58,.15), 0 4px 14px rgba(235,93,58,.3)">${escapeHtml(initial)}</div>
        <div style="min-width:0;flex:1">
          <div class="client-card__name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.display_name)}</div>
          <span class="status-pill ${c.status}">${escapeHtml(statusLabel(c.status))}</span>
        </div>
      </div>
      ${c.link ? `<div class="muted small">${escapeHtml(c.link)}</div>` : ''}
      <div class="client-card__row">${tags}</div>
      <div class="client-card__row" style="margin-top:14px">
        <button class="btn btn--ghost" data-edit>Редактировать</button>
        <button class="btn btn--danger" data-del>Удалить</button>
      </div>
    `;
    card.querySelector('[data-edit]').addEventListener('click', () => openClientEditor(c, () => refreshGrid(view)));
    card.querySelector('[data-del]').addEventListener('click', async () => {
      if (!confirm(`Удалить клиента «${c.display_name}»?`)) return;
      await api.clients.remove({ id: c.id });
      toast('Клиент удалён', 'success');
      refreshGrid(view);
    });
    grid.appendChild(card);
  }
}

function openClientEditor(client, onClose) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal__card">
      <h2>${client ? 'Редактирование' : 'Новый клиент'}</h2>
      <label class="field"><span>Имя</span><input data-f="name" value="${escapeHtml(client?.display_name || '')}"/></label>
      <label class="field"><span>Ссылка / контакт</span><input data-f="link" value="${escapeHtml(client?.link || '')}"/></label>
      <label class="field">
        <span>Статус</span>
        <select data-f="status">
          <option value="new">Новый</option>
          <option value="in_progress">В работе</option>
          <option value="closed">Закрыт</option>
          <option value="rejected">Отказ</option>
        </select>
      </label>
      <div class="modal__actions">
        <button class="btn btn--ghost" data-cancel>Отмена</button>
        <button class="btn btn--primary" data-save>Сохранить</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  if (client) wrap.querySelector('[data-f="status"]').value = client.status;
  const close = () => { wrap.remove(); onClose && onClose(); };

  wrap.querySelector('[data-cancel]').addEventListener('click', close);
  wrap.querySelector('[data-save]').addEventListener('click', async () => {
    const data = {
      display_name: wrap.querySelector('[data-f="name"]').value.trim(),
      link:         wrap.querySelector('[data-f="link"]').value.trim() || null,
      status:       wrap.querySelector('[data-f="status"]').value
    };
    if (!data.display_name) return toast('Введите имя', 'error');
    const res = client
      ? await api.clients.update({ id: client.id, ...data })
      : await api.clients.create(data);
    if (!res.ok) return toast('Ошибка: ' + res.error, 'error');
    toast('Сохранено', 'success');
    close();
  });
}
