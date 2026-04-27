import { tpl, $, $$, bind, clear, fmtTime, escapeHtml } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

const api = window.omnidesk;

let activeChatId = null;
let chatsCache = [];
let sourceFilter = 'all';
const historyLoaded = new Set();   // chat.id values for which we already pulled history this session

const SRC_LABEL = { tg: 'Telegram', vk: 'ВКонтакте' };

export async function renderInbox(host, { injectIcons }) {
  host.innerHTML = '';
  const view = tpl('tpl-view-inbox');
  host.appendChild(view);
  injectIcons(view);

  // Segmented control
  $$('.segmented__btn', view).forEach(btn => {
    btn.addEventListener('click', async () => {
      $$('.segmented__btn', view).forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      sourceFilter = btn.dataset.source;
      await refreshChats(view);
    });
  });

  // Initial sync (covers freshly-connected accounts)
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
    if (activeChatId) await refreshThreadMessages(view, activeChatId);
  });
  api.on('inbox:avatarReady', async () => {
    await refreshChats(view);
  });
}

async function refreshChats(view) {
  const filter = sourceFilter === 'all' ? {} : { source: sourceFilter };
  const res = await api.chats.list(filter);
  chatsCache = res.data || [];
  renderChatList(view, chatsCache);
}

function avatarHtml(chat, size = 'md') {
  const initial = (chat.title || '?').trim().charAt(0).toUpperCase();
  const sizeClass = size === 'lg' ? 'avatar avatar--lg' : 'avatar';
  const inner = chat.avatar_url
    ? `<img src="${escapeHtml(chat.avatar_url)}" alt="" loading="lazy" onerror="this.remove()"/>`
    : escapeHtml(initial);
  return `
    <div class="${sizeClass} ${chat.source}">
      ${inner}
      <span class="avatar__src ${chat.source}">${icon(chat.source, 11)}</span>
    </div>`;
}

function renderChatList(view, items) {
  const list = bind(view, 'chat-list');
  clear(list);
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">💬</div>
        <div class="empty-state__title">${sourceFilter === 'all' ? 'Диалогов пока нет' : 'Нет диалогов в этом источнике'}</div>
        <div class="muted small">${sourceFilter === 'all' ? 'Подождите 5–10 секунд после подключения аккаунта.' : ''}</div>
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
      </div>`;
    row.addEventListener('click', () => openChat(view, chat));
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCtxMenu(e.clientX, e.clientY, [
        { label: chat.is_pinned ? '📌 Открепить' : '📌 Закрепить', action: async () => {
            await api.chats.togglePin({ id: chat.id }); await refreshChats(view);
        }},
        { label: '✓ Отметить прочитанным', action: async () => {
            await api.chats.markRead({ id: chat.id }); await refreshChats(view);
        }},
        { label: '👤 Создать клиента из чата', action: async () => {
            const r = await api.clients.createFromChat({ chatId: chat.id });
            if (r.ok) toast('Клиент создан', 'success');
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
  menu.style.top  = y + 'px';
  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.addEventListener('click', () => { it.action(); menu.remove(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 10);
}

async function openChat(view, chat) {
  activeChatId = chat.id;
  await api.chats.markRead({ id: chat.id });
  await refreshChats(view);

  // First open in this session → pull full history from API
  if (!historyLoaded.has(chat.id)) {
    historyLoaded.add(chat.id);
    api.messages.loadHistory({ chatId: chat.id }).then(async () => {
      await refreshThreadMessages(view, chat.id);
    }).catch((e) => toast('История не загружена: ' + (e?.message || e), 'error'));
  }
  await refreshThreadHead(view, chat);
  await refreshThreadMessages(view, chat.id);
  await refreshSidePanel(view, chat);
}

async function refreshThreadHead(view, chat) {
  bind(view, 'thread-empty').hidden = true;
  bind(view, 'thread').hidden = false;
  bind(view, 'thread-title').innerHTML = `
    <div style="display:flex;gap:12px;align-items:center">
      ${avatarHtml(chat)}
      <div>
        <div style="font-weight:700;font-size:15px;letter-spacing:-.005em">${escapeHtml(chat.title)}</div>
        <div class="muted small">${SRC_LABEL[chat.source]}</div>
      </div>
    </div>`;
  bind(view, 'thread-source').innerHTML = `
    ${chat.is_pinned ? '<span class="tag-chip">📌 закреплён</span> ' : ''}
    <span class="source-badge ${chat.source}">${chat.source.toUpperCase()}</span>`;
}

async function refreshThreadMessages(view, chatId) {
  const chat = chatsCache.find(c => c.id === chatId);
  if (!chat) return;
  const msgsRes = await api.messages.list({ chatId });
  const msgs = msgsRes.data || [];
  const box = bind(view, 'thread-messages');
  clear(box);
  for (const m of msgs) {
    box.appendChild(renderBubble(m, chat));
  }
  box.scrollTop = box.scrollHeight;
}

function renderBubble(m, chat) {
  const wrap = document.createElement('div');
  wrap.className = `bubble-group ${m.direction}`;

  const bubble = document.createElement('div');
  bubble.className = `bubble ${m.direction}`;
  let html = '';

  if (m.reply_to_text) {
    html += `<div class="bubble__reply">${escapeHtml(m.reply_to_text)}</div>`;
  }

  const att = Array.isArray(m.attachments) ? m.attachments : [];
  // Render text only when there's actual text body without attachment-only marker
  const hasMedia = att.length > 0;
  const textBody = hasMedia ? extractTextOnly(m.body) : m.body;
  if (textBody && textBody !== '[пустое сообщение]') {
    html += `<div>${escapeHtml(textBody)}</div>`;
  }
  bubble.innerHTML = html;

  for (const a of att) {
    const node = renderAttachment(a, chat, m);
    if (node) bubble.appendChild(node);
  }

  // If bubble has no content at all (rare), put back the body
  if (!bubble.innerHTML) {
    bubble.textContent = m.body || '';
  }

  wrap.appendChild(bubble);
  const ts = document.createElement('div');
  ts.className = 'bubble__ts';
  ts.textContent = fmtTime(m.ts);
  wrap.appendChild(ts);
  return wrap;
}

function extractTextOnly(body) {
  // Strip our standard attachment markers from the preview text
  const markers = /(?:^|·\s)(?:📷 Фото|🎤 Голосовое.*?|🎵 .*?|🎬 Видео.*?|🌟 Стикер.*?|🎞 GIF|📎 [^·]+|🔗 [^·]+|📊 Опрос:?.*?|📍 Геолокация|↩️ Пересланные.*?|📹 Кружок.*?)(?=·|$)/g;
  return body.replace(markers, '').replace(/^·\s*|\s*·\s*$/g, '').trim();
}

function renderAttachment(a, chat, msg) {
  const div = document.createElement('div');
  div.style.marginTop = '6px';

  switch (a.kind) {
    case 'photo': {
      if (a.url) {
        div.innerHTML = `<img class="media-photo" src="${escapeHtml(a.url)}" loading="lazy" alt=""/>`;
        const img = div.querySelector('img');
        img.addEventListener('click', () => window.omnidesk.openExternal(a.fullUrl || a.url));
        img.addEventListener('error', () => {
          if (a.tgRef && chat.source === 'tg') downloadAndSwap(img, chat, msg, 'photo', 'jpg');
          else img.replaceWith(textPlaceholder('📷 Фото недоступно'));
        });
      } else if (a.tgRef && chat.source === 'tg') {
        div.innerHTML = `<div class="media-video"><div class="media-video__icon">📷</div><div class="media-video__label">Загрузить фото</div></div>`;
        div.querySelector('.media-video').addEventListener('click', async () => {
          try {
            const r = await api.media.download({ source: 'tg', externalChatId: chat.external_id, msgId: msg.external_id, kind: 'photo', ext: 'jpg' });
            if (r.ok && r.data) {
              div.innerHTML = `<img class="media-photo" src="${r.data}" alt=""/>`;
            }
          } catch (e) { toast(e.message, 'error'); }
        });
      } else {
        return textPlaceholder('📷 Фото');
      }
      return div;
    }
    case 'voice': {
      div.innerHTML = renderVoicePlayer(a);
      bindVoicePlayer(div, a, chat, msg);
      return div;
    }
    case 'audio': {
      div.innerHTML = `
        <div class="media-file">
          <div class="media-file__icon">${icon('mic', 20)}</div>
          <div style="min-width:0">
            <div class="media-file__name">${escapeHtml(a.title || 'Аудио')}</div>
            <div class="media-file__size">${escapeHtml(a.artist || '')}</div>
          </div>
        </div>`;
      return div;
    }
    case 'video': {
      const cls = a.round ? 'media-video is-round' : 'media-video';
      div.innerHTML = `<div class="${cls}"><div class="media-video__icon">${a.round ? '📹' : '🎬'}</div><div class="media-video__label">${a.round ? 'Кружок' : 'Видео'}${a.duration ? ' · ' + fmtDur(a.duration) : ''}</div></div>`;
      div.querySelector('.media-video').addEventListener('click', async () => {
        if (a.tgRef && chat.source === 'tg') {
          try {
            toast('Скачиваем видео…', 'info');
            const r = await api.media.download({ source: 'tg', externalChatId: chat.external_id, msgId: msg.external_id, kind: a.round ? 'round' : 'video', ext: 'mp4' });
            if (r.ok && r.data) {
              div.innerHTML = `<video controls autoplay style="max-width:320px;border-radius:12px"><source src="${r.data}" type="video/mp4"></video>`;
            }
          } catch (e) { toast(e.message, 'error'); }
        }
      });
      return div;
    }
    case 'sticker': {
      if (a.url) {
        div.innerHTML = `<img class="media-sticker" src="${escapeHtml(a.url)}" alt="${escapeHtml(a.alt || '')}"/>`;
      } else {
        return textPlaceholder('🌟 Стикер ' + (a.alt || ''));
      }
      return div;
    }
    case 'gif': {
      if (a.url) {
        div.innerHTML = `<img class="media-gif" src="${escapeHtml(a.url)}" alt=""/>`;
      } else if (a.previewUrl) {
        div.innerHTML = `<img class="media-gif" src="${escapeHtml(a.previewUrl)}" alt=""/>`;
      } else {
        return textPlaceholder('🎞 GIF');
      }
      return div;
    }
    case 'file': {
      div.innerHTML = `
        <div class="media-file">
          <div class="media-file__icon">${icon('paperclip', 20)}</div>
          <div style="min-width:0">
            <div class="media-file__name">${escapeHtml(a.title || 'Файл')}</div>
            <div class="media-file__size">${a.size ? humanSize(a.size) : (a.ext || '')}</div>
          </div>
        </div>`;
      div.querySelector('.media-file').addEventListener('click', () => {
        if (a.url) window.omnidesk.openExternal(a.url);
      });
      return div;
    }
    case 'link': {
      if (!a.url && !a.title) return null;
      div.innerHTML = `<div class="media-link">
        <div class="media-link__title">${escapeHtml(a.title || a.url)}</div>
        ${a.desc ? `<div class="media-link__desc">${escapeHtml(a.desc)}</div>` : ''}
      </div>`;
      div.querySelector('.media-link').addEventListener('click', () => a.url && window.omnidesk.openExternal(a.url));
      div.querySelector('.media-link').style.cursor = 'pointer';
      return div;
    }
    case 'poll':   return textPlaceholder(`📊 Опрос: ${a.question || ''}`);
    case 'geo':    return textPlaceholder('📍 Геолокация');
    default:       return null;
  }
}

function textPlaceholder(text) {
  const d = document.createElement('div');
  d.style.fontStyle = 'italic';
  d.style.color = 'var(--text-muted)';
  d.style.marginTop = '4px';
  d.textContent = text;
  return d;
}

function downloadAndSwap(img, chat, msg, kind, ext) {
  if (!msg.external_id) return;
  api.media.download({ source: chat.source, externalChatId: chat.external_id, msgId: msg.external_id, kind, ext })
    .then(r => { if (r.ok && r.data) img.src = r.data; })
    .catch(() => img.replaceWith(textPlaceholder('📷 Фото недоступно')));
}

function fmtDur(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}
function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

function renderVoicePlayer(a) {
  return `
    <div class="media-voice">
      <button class="media-voice__btn" data-play>${icon('play', 14) || '▶'}</button>
      <div class="media-voice__bar"><div class="media-voice__progress"></div></div>
      <div class="media-voice__time">${fmtDur(a.duration || 0)}</div>
    </div>`;
}

function bindVoicePlayer(scope, a, chat, msg) {
  const btn = scope.querySelector('[data-play]');
  const progress = scope.querySelector('.media-voice__progress');
  const time = scope.querySelector('.media-voice__time');
  let audio = null;

  btn.addEventListener('click', async () => {
    if (!audio) {
      let src = a.url;
      if (!src && a.tgRef && chat.source === 'tg') {
        try {
          btn.textContent = '…';
          const r = await api.media.download({ source: 'tg', externalChatId: chat.external_id, msgId: msg.external_id, kind: 'voice', ext: 'ogg' });
          if (r.ok && r.data) src = r.data;
        } catch (e) { toast(e.message, 'error'); btn.textContent = '▶'; return; }
      }
      if (!src) return;
      audio = new Audio(src);
      audio.addEventListener('timeupdate', () => {
        if (audio.duration) progress.style.width = (audio.currentTime / audio.duration * 100) + '%';
        time.textContent = fmtDur(audio.currentTime);
      });
      audio.addEventListener('ended', () => { btn.textContent = '▶'; progress.style.width = '0%'; time.textContent = fmtDur(a.duration || 0); });
    }
    if (audio.paused) { audio.play(); btn.textContent = '❚❚'; }
    else { audio.pause(); btn.textContent = '▶'; }
  });
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
  await refreshThreadMessages(view, activeChatId);
}

async function refreshSidePanel(view, chat) {
  const side = bind(view, 'side-panel');
  clear(side);

  // Walker-style hero
  const hero = document.createElement('div');
  hero.className = 'bento-hero';
  const initial = (chat.title || '?').trim().charAt(0).toUpperCase();
  const avatarMarkup = chat.avatar_url
    ? `<img src="${escapeHtml(chat.avatar_url)}" alt="" onerror="this.replaceWith(document.createTextNode('${escapeHtml(initial)}'))"/>`
    : escapeHtml(initial);

  hero.innerHTML = `
    <div class="bento-hero__stage">
      <div class="bento-hero__disc ${chat.source}"></div>
      ${ribbonSvg()}
      <div class="bento-hero__avatar">${avatarMarkup}</div>
    </div>
    <div class="bento-hero__name">${escapeHtml(chat.title || 'Без имени')}</div>
    <div class="bento-hero__sub">${SRC_LABEL[chat.source]} · ID ${escapeHtml(chat.external_id)}</div>
    <div class="bento-hero__chips">
      <span class="source-badge ${chat.source}">${chat.source.toUpperCase()}</span>
      ${chat.is_pinned ? '<span class="tag-chip">📌 закреплён</span>' : ''}
      ${chat.client_id ? '<span class="tag-chip">👤 клиент CRM</span>' : ''}
    </div>
    <div class="bento-hero__actions">
      <button class="bento-hero__action" data-act="pin"  title="${chat.is_pinned ? 'Открепить' : 'Закрепить'}">${icon('pin', 18)}</button>
      <button class="bento-hero__action" data-act="link" title="${chat.client_id ? 'Открыть карточку клиента' : 'Создать клиента'}">${icon('user', 18)}</button>
      <button class="bento-hero__action" data-act="open" title="Открыть в ${SRC_LABEL[chat.source]}">${icon('link', 18)}</button>
      <button class="bento-hero__action" data-act="read" title="Отметить прочитанным">${icon('check', 18)}</button>
    </div>
  `;
  side.appendChild(hero);

  hero.querySelector('[data-act="pin"]').addEventListener('click', async () => {
    await api.chats.togglePin({ id: chat.id });
    await refreshChats(view);
    await refreshSidePanel(view, (await api.chats.list()).data.find(c => c.id === chat.id));
  });
  hero.querySelector('[data-act="read"]').addEventListener('click', async () => {
    await api.chats.markRead({ id: chat.id });
    await refreshChats(view);
  });
  hero.querySelector('[data-act="link"]').addEventListener('click', async () => {
    if (chat.client_id) {
      toast('Карточка клиента — на странице CRM', 'info');
      return;
    }
    const r = await api.clients.createFromChat({ chatId: chat.id });
    if (r.ok) {
      toast('Клиент создан и привязан', 'success');
      await refreshChats(view);
      const updated = (await api.chats.list()).data.find(c => c.id === chat.id);
      if (updated) await refreshSidePanel(view, updated);
    } else {
      toast('Ошибка: ' + r.error, 'error');
    }
  });
  hero.querySelector('[data-act="open"]').addEventListener('click', () => {
    const url = chat.source === 'vk'
      ? `https://vk.com/im?sel=${chat.external_id}`
      : `https://t.me/`;
    api.openExternal(url);
  });

  // Notes for chat
  const notesRes = await api.notes.listForChat({ chatId: chat.id });
  const notesCard = document.createElement('div');
  notesCard.className = 'card';
  const list = (notesRes.data || []).map(n =>
    `<div style="background:var(--bg-base-2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12.5px;line-height:1.5;white-space:pre-wrap;user-select:text">${escapeHtml(n.body)}</div>`
  ).join('') || '<div class="muted small">Заметок пока нет</div>';
  notesCard.innerHTML = `
    <div class="client-card__head"><div class="client-card__name" style="display:flex;align-items:center;gap:8px">${icon('notes', 18)} Заметки</div></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">${list}</div>
    <div class="row" style="margin-top:12px">
      <input class="search fill" placeholder="Новая заметка…" data-note-input/>
      <button class="btn btn--icon" data-note-add>${icon('plus', 18)}</button>
    </div>`;
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

function ribbonSvg() {
  return `
    <svg class="bento-hero__ribbon" viewBox="0 0 220 220" preserveAspectRatio="xMidYMid meet">
      <path d="M 10 110 C 30 60, 80 50, 110 75 S 200 130, 210 90"
            fill="none" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
      <path d="M 10 130 C 30 170, 80 180, 110 155 S 200 100, 210 140"
            fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>
    </svg>`;
}
