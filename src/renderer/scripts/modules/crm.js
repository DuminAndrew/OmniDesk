import { tpl, $, $$, bind, clear, escapeHtml, statusLabel } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

const api = window.omnidesk;
let currentStatus = '';

export async function renderCRM(host, { injectIcons }) {
  host.innerHTML = '';
  const view = tpl('tpl-view-crm');
  host.appendChild(view);
  injectIcons(view);

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
    grid.innerHTML = '<div class="muted">Нет клиентов. Нажмите «Новый клиент» или создайте из чата (правый клик в инбоксе).</div>';
    return;
  }
  for (const c of items) {
    grid.appendChild(await renderClientCard(c, view));
  }
}

async function renderClientCard(c, view) {
  const tagsRes = await api.tags.listForClient({ clientId: c.id });
  const chatsRes = await api.clients.listChats({ id: c.id });
  const tags  = (tagsRes.data  || []).map(t => `<span class="tag-chip">${escapeHtml(t.name)}</span>`).join('');
  const chats = chatsRes.data || [];
  const hasTg = chats.some(ch => ch.source === 'tg');
  const hasVk = chats.some(ch => ch.source === 'vk');

  const card = document.createElement('div');
  card.className = 'bento-hero';
  card.style.cursor = 'pointer';

  const initial = (c.display_name || '?').trim().charAt(0).toUpperCase();
  const avatarMarkup = c.avatar_url
    ? `<img src="${escapeHtml(c.avatar_url)}" alt="" onerror="this.replaceWith(document.createTextNode('${escapeHtml(initial)}'))"/>`
    : escapeHtml(initial);

  // Color disc by main source: TG > VK > CRM(orange)
  const discCls = hasTg ? 'tg' : hasVk ? 'vk' : 'crm';

  card.innerHTML = `
    <div class="bento-hero__stage">
      <div class="bento-hero__disc ${discCls}"></div>
      ${ribbonSvg()}
      <div class="bento-hero__avatar">${avatarMarkup}</div>
    </div>
    <div class="bento-hero__name">${escapeHtml(c.display_name)}</div>
    <div class="bento-hero__sub">
      ${c.short_name ? '<b>@' + escapeHtml(c.short_name) + '</b>' : ''}
      ${c.short_name && c.phone ? ' · ' : ''}
      ${c.phone ? escapeHtml(c.phone) : ''}
    </div>
    <div class="bento-hero__chips">
      <span class="status-pill ${c.status}">${escapeHtml(statusLabel(c.status))}</span>
      ${tags}
    </div>
    ${chats.length ? `<div class="linked-chats">
      ${chats.map(ch => `<div class="linked-chat" data-chat="${ch.id}">
        <span class="source-badge ${ch.source}">${ch.source.toUpperCase()}</span>
        <span class="linked-chat__title">${escapeHtml(ch.title)}</span>
      </div>`).join('')}
    </div>` : ''}
    <div class="bento-hero__actions" style="margin-top:14px">
      ${hasTg ? `<div class="bento-hero__action" title="Telegram привязан">${icon('tg', 18)}</div>` : `<div class="bento-hero__action" style="opacity:.3" title="Telegram не привязан">${icon('tg', 18)}</div>`}
      ${hasVk ? `<div class="bento-hero__action" title="ВКонтакте привязан">${icon('vk', 18)}</div>` : `<div class="bento-hero__action" style="opacity:.3" title="ВКонтакте не привязан">${icon('vk', 18)}</div>`}
      <button class="bento-hero__action" data-edit title="Редактировать">${icon('edit', 18)}</button>
      <button class="bento-hero__action" data-del  title="Удалить">${icon('trash', 18)}</button>
    </div>`;

  card.querySelector('[data-edit]').addEventListener('click', (e) => {
    e.stopPropagation();
    openClientEditor(c, () => refreshGrid(view));
  });
  card.querySelector('[data-del]').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Удалить клиента «${c.display_name}»?`)) return;
    await api.clients.remove({ id: c.id });
    toast('Удалено', 'success');
    refreshGrid(view);
  });

  return card;
}

function openClientEditor(client, onClose) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal__card modal__card--wide">
      <h2>${client ? 'Редактирование клиента' : 'Новый клиент'}</h2>
      <div class="field-row">
        <label class="field"><span>Имя</span><input data-f="display_name" value="${escapeHtml(client?.display_name || '')}"/></label>
        <label class="field"><span>Короткое имя (для нас)</span><input data-f="short_name" value="${escapeHtml(client?.short_name || '')}" placeholder="ivan_ceo"/></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Телефон</span><input data-f="phone" value="${escapeHtml(client?.phone || '')}" placeholder="+7..."/></label>
        <label class="field"><span>Статус</span>
          <select data-f="status">
            <option value="new">Новый</option>
            <option value="in_progress">В работе</option>
            <option value="closed">Закрыт</option>
            <option value="rejected">Отказ</option>
          </select>
        </label>
      </div>
      <div class="field-row">
        <label class="field"><span>Telegram</span><input data-f="tg_link" value="${escapeHtml(client?.tg_link || '')}" placeholder="https://t.me/..."/></label>
        <label class="field"><span>ВКонтакте</span><input data-f="vk_link" value="${escapeHtml(client?.vk_link || '')}" placeholder="https://vk.com/..."/></label>
      </div>
      <label class="field"><span>Ссылка / контакт</span><input data-f="link" value="${escapeHtml(client?.link || '')}"/></label>
      <label class="field"><span>URL аватарки</span><input data-f="avatar_url" value="${escapeHtml(client?.avatar_url || '')}" placeholder="https://..."/></label>
      <label class="field"><span>О клиенте</span><textarea data-f="about" rows="3">${escapeHtml(client?.about || '')}</textarea></label>
      <div class="modal__actions">
        <button class="btn btn--ghost" data-cancel>Отмена</button>
        <button class="btn btn--primary" data-save>Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  if (client) wrap.querySelector('[data-f="status"]').value = client.status;

  const close = () => { wrap.remove(); onClose && onClose(); };
  wrap.querySelector('[data-cancel]').addEventListener('click', close);
  wrap.querySelector('[data-save]').addEventListener('click', async () => {
    const data = {
      display_name: wrap.querySelector('[data-f="display_name"]').value.trim(),
      short_name:   wrap.querySelector('[data-f="short_name"]').value.trim() || null,
      phone:        wrap.querySelector('[data-f="phone"]').value.trim() || null,
      tg_link:      wrap.querySelector('[data-f="tg_link"]').value.trim() || null,
      vk_link:      wrap.querySelector('[data-f="vk_link"]').value.trim() || null,
      link:         wrap.querySelector('[data-f="link"]').value.trim() || null,
      avatar_url:   wrap.querySelector('[data-f="avatar_url"]').value.trim() || null,
      about:        wrap.querySelector('[data-f="about"]').value.trim() || null,
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

function ribbonSvg() {
  return `<svg class="bento-hero__ribbon" viewBox="0 0 220 220">
    <path d="M 10 110 C 30 60, 80 50, 110 75 S 200 130, 210 90"
          fill="none" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
    <path d="M 10 130 C 30 170, 80 180, 110 155 S 200 100, 210 140"
          fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
  </svg>`;
}
