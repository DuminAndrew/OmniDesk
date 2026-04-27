import { tpl, $, $$, bind, clear, fmtTime, escapeHtml } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const api = window.omnidesk;

let activeChatId = null;
let chatsCache = [];

export async function renderInbox(host) {
  host.innerHTML = '';
  const view = tpl('tpl-view-inbox');
  host.appendChild(view);

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

  // Live updates
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

function renderChatList(view, items) {
  const list = bind(view, 'chat-list');
  clear(list);
  if (!items.length) {
    list.innerHTML = '<div class="muted small" style="padding:18px">Нет диалогов. Подключите аккаунты в Настройках.</div>';
    return;
  }
  for (const chat of items) {
    const row = document.createElement('div');
    row.className = 'chat-item' + (chat.id === activeChatId ? ' is-active' : '');
    const initial = (chat.title || '?').trim().charAt(0).toUpperCase();
    row.innerHTML = `
      <div class="chat-item__avatar ${chat.source}">${escapeHtml(initial)}</div>
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
      renderChatList(view, chatsCache);
      await refreshThread(view, chat.id);
    });
    list.appendChild(row);
  }
}

async function refreshThread(view, chatId) {
  const chat = chatsCache.find(c => c.id === chatId);
  if (!chat) return;
  bind(view, 'thread-empty').hidden = true;
  bind(view, 'thread').hidden = false;
  bind(view, 'thread-title').textContent = chat.title;
  bind(view, 'thread-source').innerHTML = `<span class="source-badge ${chat.source}">${chat.source.toUpperCase()}</span>`;

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

  const card = document.createElement('div');
  card.className = 'client-card';
  card.innerHTML = `
    <div class="client-card__head">
      <div class="client-card__name">${escapeHtml(chat.title)}</div>
      <span class="source-badge ${chat.source}">${chat.source.toUpperCase()}</span>
    </div>
    <div class="muted small">External ID: ${escapeHtml(chat.external_id)}</div>
  `;
  side.appendChild(card);

  // Notes for chat
  const notesRes = await api.notes.listForChat({ chatId: chat.id });
  const notesCard = document.createElement('div');
  notesCard.className = 'client-card';
  const list = (notesRes.data || []).map(n => `<div class="note-card__body small">${escapeHtml(n.body)}</div>`).join('') || '<div class="muted small">Нет заметок</div>';
  notesCard.innerHTML = `
    <div class="client-card__head"><div class="client-card__name">📝 Заметки</div></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">${list}</div>
    <div class="row" style="margin-top:10px;display:flex;gap:8px">
      <input class="search" placeholder="Новая заметка…" data-note-input style="flex:1"/>
      <button class="btn btn--ghost" data-note-add>+</button>
    </div>
  `;
  side.appendChild(notesCard);

  notesCard.querySelector('[data-note-add]').addEventListener('click', async () => {
    const input = notesCard.querySelector('[data-note-input]');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    await api.notes.create({ chat_id: chat.id, body });
    await refreshSidePanel(view, chat);
  });
}
