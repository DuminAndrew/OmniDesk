import { tpl, $, $$, bind, clear, escapeHtml, fmtTime } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

const api = window.omnidesk;
let currentStatus = 'pending';

export async function renderTasks(host, { injectIcons }) {
  host.innerHTML = '';
  const view = tpl('tpl-view-tasks');
  host.appendChild(view);
  injectIcons(view);

  $$('.filter', view).forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter', view).forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentStatus = btn.dataset.status;
      refresh(view);
    });
  });

  $('[data-action="new-task"]', view).addEventListener('click', () => openTaskEditor(null, () => refresh(view)));
  await refresh(view);
}

async function refresh(view) {
  const res = await api.tasks.list({ status: currentStatus });
  const tasks = res.data || [];
  const list = bind(view, 'tasks-list');
  clear(list);

  if (!tasks.length) {
    list.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Нет задач в этой категории.</div>';
    return;
  }

  // Group by due bucket
  const buckets = bucketTasks(tasks);
  for (const [label, items] of buckets) {
    if (!items.length) continue;
    const sep = document.createElement('div');
    sep.className = 'task-group';
    sep.textContent = label;
    list.appendChild(sep);
    for (const t of items) list.appendChild(taskCard(t, view));
  }
}

function bucketTasks(tasks) {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = today.getTime() + 86400000;
  const weekEnd = today.getTime() + 7 * 86400000;
  const buckets = new Map([
    ['Просрочены',   []],
    ['Сегодня',      []],
    ['Завтра',       []],
    ['На неделе',    []],
    ['Позже',        []],
    ['Без срока',    []],
    ['Завершены',    []]
  ]);
  for (const t of tasks) {
    if (t.completed) { buckets.get('Завершены').push(t); continue; }
    if (!t.due_at)   { buckets.get('Без срока').push(t); continue; }
    if (t.due_at < today.getTime())     { buckets.get('Просрочены').push(t); continue; }
    if (t.due_at < tomorrow)            { buckets.get('Сегодня').push(t); continue; }
    if (t.due_at < tomorrow + 86400000) { buckets.get('Завтра').push(t); continue; }
    if (t.due_at < weekEnd)             { buckets.get('На неделе').push(t); continue; }
    buckets.get('Позже').push(t);
  }
  return buckets;
}

function taskCard(t, view) {
  const card = document.createElement('div');
  card.className = 'task-card' +
    (t.completed ? ' is-completed' : '') +
    (!t.completed && t.due_at && t.due_at < Date.now() ? ' is-overdue' : '');

  const dueLabel = t.due_at
    ? new Date(t.due_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  const priorityLabel = { low: 'низкий', normal: 'обычный', high: 'высокий' }[t.priority] || t.priority;

  card.innerHTML = `
    <div class="task-checkbox ${t.completed ? 'is-checked' : ''}" data-toggle></div>
    <div style="min-width:0">
      <div class="task-card__title">${escapeHtml(t.title)}</div>
      ${t.body ? `<div class="muted small" style="margin-top:4px">${escapeHtml(t.body)}</div>` : ''}
      <div class="task-card__meta">
        ${dueLabel ? `<span class="task-card__due">📅 ${dueLabel}</span>` : ''}
        <span class="task-card__priority ${t.priority}">${priorityLabel}</span>
        ${t.client_name ? `<span>👤 ${escapeHtml(t.client_name)}</span>` : ''}
      </div>
    </div>
    <div class="task-card__actions">
      <button class="btn btn--icon" data-edit title="Изменить">${icon('edit', 16)}</button>
      <button class="btn btn--icon" data-del title="Удалить">${icon('trash', 16)}</button>
    </div>`;

  card.querySelector('[data-toggle]').addEventListener('click', async () => {
    await api.tasks.toggleComplete({ id: t.id });
    refresh(view);
  });
  card.querySelector('[data-edit]').addEventListener('click', () => openTaskEditor(t, () => refresh(view)));
  card.querySelector('[data-del]').addEventListener('click', async () => {
    if (!confirm(`Удалить задачу «${t.title}»?`)) return;
    await api.tasks.remove({ id: t.id });
    toast('Удалено', 'success');
    refresh(view);
  });

  return card;
}

export function openTaskEditor(task, onClose, defaults = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal__card modal__card--wide">
      <h2>${task ? 'Редактирование задачи' : 'Новая задача'}</h2>
      <label class="field"><span>Что сделать</span><input data-f="title" value="${escapeHtml(task?.title || '')}" placeholder="Позвонить Ивану по поводу договора"/></label>
      <label class="field"><span>Описание (опц.)</span><textarea data-f="body" rows="3">${escapeHtml(task?.body || '')}</textarea></label>
      <div class="field-row">
        <label class="field"><span>Срок</span><input type="datetime-local" data-f="due_at"/></label>
        <label class="field">
          <span>Приоритет</span>
          <select data-f="priority">
            <option value="low">Низкий</option>
            <option value="normal" selected>Обычный</option>
            <option value="high">Высокий</option>
          </select>
        </label>
      </div>
      <label class="field">
        <span>Клиент (опц.)</span>
        <select data-f="client_id"><option value="">— не привязывать —</option></select>
      </label>
      <div class="modal__actions">
        <button class="btn btn--ghost" data-cancel>Отмена</button>
        <button class="btn btn--primary" data-save>Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  // Pre-fill defaults from caller (e.g. when creating from a chat or client view)
  if (defaults.client_id) wrap.querySelector('[data-f="client_id"]').dataset.preset = String(defaults.client_id);

  // Pre-fill from existing task
  if (task) {
    wrap.querySelector('[data-f="priority"]').value = task.priority;
    if (task.due_at) {
      const d = new Date(task.due_at);
      const off = d.getTimezoneOffset() * 60000;
      wrap.querySelector('[data-f="due_at"]').value = new Date(d.getTime() - off).toISOString().slice(0, 16);
    }
  }

  // Populate clients list
  api.clients.list({}).then(r => {
    const sel = wrap.querySelector('[data-f="client_id"]');
    for (const c of (r.data || [])) {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.display_name;
      sel.appendChild(opt);
    }
    if (task?.client_id)         sel.value = String(task.client_id);
    else if (defaults.client_id) sel.value = String(defaults.client_id);
  });

  const close = () => { wrap.remove(); onClose && onClose(); };
  wrap.querySelector('[data-cancel]').addEventListener('click', close);
  wrap.querySelector('[data-save]').addEventListener('click', async () => {
    const title = wrap.querySelector('[data-f="title"]').value.trim();
    if (!title) return toast('Укажите название', 'error');
    const dueRaw = wrap.querySelector('[data-f="due_at"]').value;
    const due_at = dueRaw ? new Date(dueRaw).getTime() : null;
    const data = {
      title,
      body: wrap.querySelector('[data-f="body"]').value.trim() || null,
      due_at,
      priority: wrap.querySelector('[data-f="priority"]').value,
      client_id: Number(wrap.querySelector('[data-f="client_id"]').value) || null,
      chat_id: defaults.chat_id || null
    };
    const res = task
      ? await api.tasks.update({ id: task.id, ...data })
      : await api.tasks.create(data);
    if (!res.ok) return toast('Ошибка: ' + res.error, 'error');
    toast('Сохранено', 'success');
    close();
  });
}
