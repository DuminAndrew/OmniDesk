import { tpl, $, $$, bind, clear, fmtTime, escapeHtml } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const api = window.omnidesk;

let activeChatId = null;
let chatsCache = [];

const SRC_LABEL = { tg: 'Telegram', vk: 'ВКонтакте' };
const SRC_GLYPH = {
  tg: '<svg viewBox="0 0 24 24" width="11" height="11" fill="white"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>',
  vk: '<svg viewBox="0 0 24 24" width="11" height="11" fill="white"><path d="M2.95 7.13c.13-.43.43-.6.96-.6h2.45c.59 0 .8.27.94.7 0 0 1.21 3.55 2.83 5.85.63.91 1.07.95 1.4.66.65-.55.51-3.4.51-3.4-.04-.92-.27-1.34-.79-1.55-.32-.13-.04-.5.4-.6.86-.18 2.99-.18 4.04-.04.6.08.85.41.85 1.16v3.43c0 .57.27.78.45.78.34 0 .58-.21.96-.6.96-1.07 1.66-2.74 1.99-3.93.1-.35.36-.5.81-.5h2.34c.7 0 .85.36.7.85-.36 1.51-2.04 4.06-2.71 5.04-.32.51-.43.74 0 1.31.32.42 1.43 1.42 2.04 2.13.7.85 1.21 1.55.36 1.96-.34.16-1.92.16-3.28-.43-.85-.36-1.55-.92-2.34-1.66-1.07-1.04-1.5-1.27-1.78-1.04-.27.21-.32.6-.32 1.43v.95c0 .57-.18.92-1.42.92-2.06 0-4.34-1.27-5.97-3.6C4.21 12.16 2.81 8.41 2.95 7.13z"/></svg>'
};

export async function renderInbox(host) {
  host.innerHTML = '';
  const view = tpl('tpl-view-inbox');
  host.appendChild(view);

  // First-time: ask backend to pull dialogs from connected services
  api.chats.syncDialogs().then(() => refreshChats(view)).catch(() => {});

  await refreshChats(view);
  $('[data-bind="search"]', view).addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderChatList(view, chatsCache.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.last_message || '').toLowerCase().includes(q)
    ));
  });

  $('[data-action="send"]', view).addEventListener('click', () => sendMessage(view));
  $('[data-bind="composer"]', view).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendMessage(view);
  });

  api.on('inbox:newMessage', async () => {
    await refreshChats(view);
    if (activeChatId) await refreshThread(view, activeChatId);
  });
}

async function refreshChats(view) {
  const res = await api.chats.list();
  chatsCache = res.data || [];
  renderChatList(view, chatsCache);
}

function avatarHtml(chat) {
  const initial = (chat.title || '?').trim().charAt(0).toUpperCase();
  return `
    <div class="avatar ${chat.source}">
      ${escapeHtml(initial)}
      <span class="avatar__src ${chat.source}" title="${SRC_LABEL[chat.source]}">${SRC_GLYPH[chat.source]}</span>
    </div>
  `;
}

function renderChatList(view, items) {
  const list = bind(view, 'chat-list');
  clear(list);
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">💬</div>
        <div class="empty-state__title">Диалоги пока не загружены</div>
        <div class="muted small">Если только что подключили аккаунт — подождите 5–10 сек, идёт синхронизация.</div>
      </div>`;
    return;
  }
  for (const chat of items) {
    const row = document.createElement('div');
    row.className = 'chat-item' + (chat.id === activeChatId ? ' is-active' : '') + (chat.is_pinned ? ' is-pinned' : '');
    row.innerHTML = `
      ${avatarHtml(chat)}
      <div style="min-width:0">
        <div class="chat-item__name">${escapeHtml(chat.title || 'Без имени')}</div>
        <div class="chat-item__last">${escapeHtml(chat.last_message || '')}</div>
      </div>
      <div class="chat-item__meta">
        <span class="source-badge ${chat.source}">${chat.source.toUpperCase()}</span>
        <span>${fmtTime(chat.last_ts)}</span>
        ${chat.unread_count ? `<span class="chat-item__badge">${chat.unread_count}</span>` : ''}
      </div>
    `;
    row.addEventListener('click', async () => {
      activeChatId = chat.id;
      await api.chats.markRead({ id: chat.id });
      await refreshChats(view);
      await refreshThread(view, chat.id);
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCtxMenu(e.clientX, e.clientY, [
        { label: chat.is_pinned ? '📌 Открепить' : '📌 Закрепить', action: async () => {
            await api.chats.togglePin({ id: chat.id });
            await refreshChats(view);
        }},
        { label: '✓ Отметить прочитанным', action: async () => {
            await api.chats.markRead({ id: chat.id });
            await refreshChats(view);
        }}
      ]);
    });
    list.appendChild(row);
  }
}

function openCtxMenu(x, y, items) {
  document.querySelectorAll('.ctx-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.addEventListener('click', () => { it.action(); menu.remove(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  }, 10);
}

async function refreshThread(view, chatId) {
  const chat = chatsCache.find(c => c.id === chatId);
  if (!chat) return;
  bind(view, 'thread-empty').hidden = true;
  bind(view, 'thread').hidden = false;
  bind(view, 'thread-title').innerHTML = `
    <div style="display:flex;gap:10px;align-items:center">
      ${avatarHtml({ ...chat })}
      <div>
        <div style="font-weight:600">${escapeHtml(chat.title)}</div>
        <div class="muted small">${SRC_LABEL[chat.source]}</div>
      </div>
    </div>
  `;
  bind(view, 'thread-source').innerHTML = `
    ${chat.is_pinned ? '<span class="source-badge tg" style="margin-right:8px">📌 закреплён</span>' : ''}
    <span class="source-badge ${chat.source}">${chat.source.toUpperCase()}</span>
  `;

  const msgsRes = await api.messages.list({ chatId });
  const msgs = msgsRes.data || [];
  const box = bind(view, 'thread-messages');
  clear(box);
  for (const m of msgs) {
    const b = document.createElement('div');
    b.className = `bubble ${m.direction}`;
    b.innerHTML = `<div>${escapeHtml(m.body)}</div><div class="bubble__ts">${fmtTime(m.ts)}</div>`;
    box.appendChild(b);
  }
  box.scrollTop = box.scrollHeight;

  await refreshSidePanel(view, chat);
}

async function sendMessage(view) {
  if (!activeChatId) return;
  const ta = bind(view, 'composer');
  const text = ta.value.trim();
  if (!text) return;
  ta.value = '';
  const res = await api.inbox.sendMessage({ chatRowId: activeChatId, text });
  if (!res.ok) { toast('Не отправлено: ' + res.error, 'error'); return; }
  await refreshChats(view);
  await refreshThread(view, activeChatId);
}

async function refreshSidePanel(view, chat) {
  const side = bind(view, 'side-panel');
  clear(side);

  const initial = (chat.title || '?').trim().charAt(0).toUpperCase();
  const hero = document.createElement('div');
  hero.className = 'bento-hero';
  hero.innerHTML = `
    <div class="bento-hero__halo ${chat.source}"></div>
    <div class="bento-hero__avatar">${escapeHtml(initial)}</div>
    <div class="bento-hero__name">${escapeHtml(chat.title)}</div>
    <div class="bento-hero__sub">${SRC_LABEL[chat.source]} · ID ${escapeHtml(chat.external_id)}</div>
    <div class="bento-hero__badges">
      <span class="source-badge ${chat.source}">${chat.source.toUpperCase()}</span>
      ${chat.is_pinned ? '<span class="tag-chip">📌 закреплён</span>' : ''}
    </div>
    <div class="bento-hero__actions">
      <button class="bento-hero__action" data-act="pin" title="${chat.is_pinned ? 'Открепить' : 'Закрепить'}">📌</button>
      <button class="bento-hero__action" data-act="note" title="Заметка">📝</button>
      <button class="bento-hero__action" data-act="link" title="Привязать к клиенту">👤</button>
      <button class="bento-hero__action" data-act="read" title="Прочитано">✓</button>
    </div>
  `;
  side.appendChild(hero);

  hero.querySelector('[data-act="pin"]').addEventListener('click', async () => {
    await api.chats.togglePin({ id: chat.id });
    await refreshChats(view);
    await refreshThread(view, chat.id);
  });
  hero.querySelector('[data-act="read"]').addEventListener('click', async () => {
    await api.chats.markRead({ id: chat.id });
    await refreshChats(view);
  });
  hero.querySelector('[data-act="note"]').addEventListener('click', () => {
    const input = side.querySelector('[data-note-input]');
    if (input) input.focus();
  });
  hero.querySelector('[data-act="link"]').addEventListener('click', () => {
    toast('Привязка к клиенту — на странице CRM', 'info');
  });

  // Notes for chat
  const notesRes = await api.notes.listForChat({ chatId: chat.id });
  const notesCard = document.createElement('div');
  notesCard.className = 'client-card';
  const list = (notesRes.data || []).map(n =>
    `<div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12px;line-height:1.5;white-space:pre-wrap;user-select:text">${escapeHtml(n.body)}</div>`
  ).join('') || '<div class="muted small">Заметок пока нет</div>';
  notesCard.innerHTML = `
    <div class="client-card__head"><div class="client-card__name">📝 Заметки</div></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">${list}</div>
    <div class="row" style="margin-top:12px;display:flex;gap:8px">
      <input class="search" placeholder="Новая заметка…" data-note-input style="flex:1"/>
      <button class="btn btn--ghost" data-note-add>+</button>
    </div>
  `;
  side.appendChild(notesCard);

  const addNote = async () => {
    const input = notesCard.querySelector('[data-note-input]');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    await api.notes.create({ chat_id: chat.id, body });
    await refreshSidePanel(view, chat);
  };
  notesCard.querySelector('[data-note-add]').addEventListener('click', addNote);
  notesCard.querySelector('[data-note-input]').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNote();
  });
}
