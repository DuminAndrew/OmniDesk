import { tpl, $, $$, bind, clear, fmtTime, escapeHtml, initials, avatarGradient } from '../ui/dom.js';
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
  $('[data-action="attach"]', view).addEventListener('click', () => attachFile(view));

  const composer = $('[data-bind="composer"]', view);
  composer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendMessage(view);
  });
  const handlePaste = async (e) => {
    if (!activeChatId) return;
    const items = e.clipboardData?.items;
    if (!items || !items.length) return;
    for (const item of items) {
      const isFile  = item.kind === 'file';
      const isImage = (item.type || '').startsWith('image/');
      if (!isFile || !isImage) continue;

      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;
      const ext = ((item.type.split('/')[1] || 'png').split(';')[0] || 'png').toLowerCase();
      try {
        const buffer = await blob.arrayBuffer();
        // Pass the raw bytes through preload via a Uint8Array (Electron clones
        // ArrayBuffer cleanly through ipcRenderer.invoke)
        const r = await api.inbox.savePastedImage({
          buffer: new Uint8Array(buffer),
          ext
        });
        if (r?.ok && r.data) {
          pendingAttach = r.data;
          showAttachChip(view, pendingAttach);
          toast('Картинка из буфера готова — добавь подпись (опц.) и жми «Отправить»', 'success', 2200);
        } else {
          toast('Не удалось вставить: ' + (r?.error || 'нет данных'), 'error');
        }
      } catch (err) {
        toast('Не удалось вставить: ' + err.message, 'error');
      }
      return;
    }
  };
  composer.addEventListener('paste', handlePaste);
  // Window-level fallback: when chat is open and the user Ctrl+V's anywhere
  // (not strictly inside the textarea), still grab pasted images
  document.addEventListener('paste', (e) => {
    // Only if focus isn't on a different editable field
    const t = e.target;
    if (t === composer) return; // already handled above
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    handlePaste(e);
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
  const ini = initials(chat.title);
  const sizeClass = size === 'lg' ? 'avatar avatar--lg' : 'avatar';
  const grad = avatarGradient(chat.title || chat.external_id || '');
  if (chat.avatar_url) {
    return `
      <div class="${sizeClass} ${chat.source}" style="background:${grad}">
        <img src="${escapeHtml(chat.avatar_url)}" alt="" loading="lazy" onerror="this.remove()"/>
        <span class="avatar__src ${chat.source}">${icon(chat.source, 11)}</span>
      </div>`;
  }
  return `
    <div class="${sizeClass} ${chat.source}" style="background:${grad}">
      <span class="avatar__initials">${escapeHtml(ini)}</span>
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
  try {
    activeChatId = chat.id;
    // Render head + side + whatever messages exist locally — don't wait
    await refreshThreadHead(view, chat);
    await refreshSidePanel(view, chat);
    await refreshThreadMessages(view, chat);

    // Background: mark read + refresh sidebar list
    api.chats.markRead({ id: chat.id }).catch(() => {});
    refreshChats(view);

    // Background: pull full history once per session
    if (!historyLoaded.has(chat.id)) {
      historyLoaded.add(chat.id);
      try {
        await api.messages.loadHistory({ chatId: chat.id });
        await refreshThreadMessages(view, chat);
      } catch (e) {
        toast('История не загружена: ' + (e?.message || e), 'error');
      }
    }
  } catch (e) {
    toast('Ошибка открытия чата: ' + e.message, 'error');
  }
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

async function refreshThreadMessages(view, chatOrId) {
  const chatId = typeof chatOrId === 'object' ? chatOrId.id : chatOrId;
  let chat = typeof chatOrId === 'object'
    ? chatOrId
    : chatsCache.find(c => c.id === chatId);
  if (!chat) {
    const r = await api.chats.list({});
    chat = (r.data || []).find(c => c.id === chatId);
  }
  if (!chat) return;
  const box = bind(view, 'thread-messages');
  if (!box) return;
  const msgsRes = await api.messages.list({ chatId });
  const msgs = msgsRes.data || [];
  clear(box);
  if (!msgs.length) {
    const empty = document.createElement('div');
    empty.className = 'muted small';
    empty.style.cssText = 'text-align:center;padding:30px;opacity:.7';
    empty.textContent = 'История загружается…';
    box.appendChild(empty);
    return;
  }
  for (const m of msgs) {
    box.appendChild(renderBubble(m, chat));
  }
  box.scrollTop = box.scrollHeight;

  // Auto-download TG media if user enabled it in Settings
  if (chat.source === 'tg' && localStorage.getItem('omnidesk:autoMedia') === '1') {
    autoDownloadTgMedia(box, chat, msgs);
  }
}

const autoDownloaded = new Set();
async function autoDownloadTgMedia(box, chat, msgs) {
  for (const m of msgs) {
    if (!Array.isArray(m.attachments) || !m.external_id) continue;
    for (const a of m.attachments) {
      if (!a.tgRef) continue;
      const key = `${chat.id}-${m.external_id}-${a.kind}`;
      if (autoDownloaded.has(key)) continue;
      autoDownloaded.add(key);
      // Only auto-fetch lightweight media (photos + voice). Videos / files
      // stay click-to-load to avoid eating bandwidth on huge attachments.
      if (a.kind === 'photo') {
        api.media.download({ source: 'tg', externalChatId: chat.external_id, msgId: m.external_id, kind: 'photo', ext: 'jpg' })
          .then(r => {
            if (!r?.ok || !r.data) return;
            const placeholder = box.querySelector(`[data-msg-id="${m.id}"] .media-video`);
            if (placeholder) {
              const wrap = placeholder.parentElement;
              wrap.innerHTML = `<img class="media-photo" src="${r.data}" alt=""/>`;
              wrap.querySelector('img').addEventListener('click', () => openLightbox(r.data));
            }
          }).catch(() => {});
      } else if (a.kind === 'voice') {
        api.media.download({ source: 'tg', externalChatId: chat.external_id, msgId: m.external_id, kind: 'voice', ext: 'ogg' })
          .catch(() => {});
      }
    }
  }
}

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

function extractFirstUrl(text) {
  if (!text) return null;
  const matches = text.match(URL_REGEX);
  if (!matches || !matches.length) return null;
  // Strip trailing punctuation
  return matches[0].replace(/[.,;:!?)]+$/, '');
}

function renderBubble(m, chat) {
  const wrap = document.createElement('div');
  wrap.className = `bubble-group ${m.direction}`;

  const bubble = document.createElement('div');
  bubble.className = `bubble ${m.direction}`;
  let html = '';

  // Sender name (groups / chats)
  if (m.direction === 'in' && m.sender_name) {
    const av = m.sender_avatar
      ? `<div class="bubble__sender-avatar"><img src="${escapeHtml(m.sender_avatar)}" onerror="this.remove()"/></div>`
      : '';
    html += `<div class="bubble__sender">${av}${escapeHtml(m.sender_name)}</div>`;
  }

  if (m.reply_to_text || m.reply_to_author) {
    html += `<div class="bubble__reply">
      ${m.reply_to_author ? `<div class="bubble__reply-author">${escapeHtml(m.reply_to_author)}</div>` : ''}
      <div class="bubble__reply-text">${escapeHtml(m.reply_to_text || '[медиа]')}</div>
    </div>`;
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

  // Auto link preview for plain URLs in body (only if no structured link
  // attachment already present)
  const hasLinkAtt = att.some(a => a.kind === 'link');
  if (!hasLinkAtt) {
    const url = extractFirstUrl(m.body);
    if (url) {
      const preview = document.createElement('div');
      preview.className = 'link-preview-slot';
      bubble.appendChild(preview);
      // Lazy fetch
      api.link.preview(url).then(res => {
        if (!res?.ok || !res.data) return;
        renderLinkPreview(preview, res.data);
      }).catch(() => {});
    }
  }

  wrap.appendChild(bubble);
  const ts = document.createElement('div');
  ts.className = 'bubble__ts';
  ts.textContent = fmtTime(m.ts);
  wrap.appendChild(ts);
  return wrap;
}

function renderLinkPreview(host, p) {
  const img = p.image
    ? `<img class="link-preview__image" src="${escapeHtml(p.image)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"/>`
    : '';
  const card = document.createElement('div');
  card.className = 'link-preview';
  card.innerHTML = `
    ${img}
    <div class="link-preview__body">
      ${p.siteName ? `<div class="link-preview__site">${escapeHtml(p.siteName)}</div>` : ''}
      <div class="link-preview__title">${escapeHtml(p.title || p.url)}</div>
      ${p.description ? `<div class="link-preview__desc">${escapeHtml(p.description)}</div>` : ''}
    </div>`;
  card.addEventListener('click', () => api.openExternal(p.url));
  host.replaceWith(card);
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
        img.addEventListener('click', () => openLightbox(a.fullUrl || a.url));
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
              div.querySelector('img').addEventListener('click', () => openLightbox(r.data));
            }
          } catch (e) { toast(e.message, 'error'); }
        });
      } else {
        return textPlaceholder('📷 Фото');
      }
      return div;
    }
    case 'voice': {
      div.innerHTML = renderVoicePlayer(a, msg);
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
      const label = (a.round ? 'Кружок' : (a.title || 'Видео')) + (a.duration ? ' · ' + fmtDur(a.duration) : '');
      div.innerHTML = `<div class="${cls}" data-state="idle">
        <div class="media-video__icon">${a.round ? '📹' : '🎬'}</div>
        <div class="media-video__label">${escapeHtml(label)}</div>
        <div class="media-video__hint muted small" style="margin-top:4px">Нажмите для воспроизведения</div>
      </div>`;
      const card = div.querySelector('.media-video');
      let cachedSrc = null;

      const setState = (state, msg) => {
        card.dataset.state = state;
        card.querySelector('.media-video__hint').textContent = msg;
        card.querySelector('.media-video__icon').textContent = {
          idle: a.round ? '📹' : '🎬',
          loading: '⏳',
          ready: '▶',
          error: '⚠',
          playing: '▶'
        }[state] || '🎬';
      };

      const playLightbox = (src) => {
        openVideoLightbox({ src, type: 'mp4' });
      };

      card.addEventListener('click', async () => {
        // Already downloaded → just open lightbox
        if (cachedSrc) { playLightbox(cachedSrc); return; }

        // VK iframe path — no download needed, opens straight in lightbox
        if (chat.source === 'vk' && a.vkEmbedUrl) {
          openVideoLightbox({ src: a.vkEmbedUrl, type: 'iframe', fallbackUrl: a.vkUrl });
          return;
        }

        // TG download path
        if (a.tgRef && chat.source === 'tg' && msg.external_id) {
          if (card.dataset.state === 'loading') return; // already in flight
          setState('loading', 'Скачивание из Telegram…');
          try {
            const r = await api.media.download({
              source: 'tg', externalChatId: chat.external_id,
              msgId: msg.external_id, kind: a.round ? 'round' : 'video', ext: 'mp4'
            });
            if (r.ok && r.data) {
              cachedSrc = r.data;
              setState('ready', 'Готово · нажмите для просмотра');
              card.style.borderColor = 'rgba(46,204,113,.4)';
              playLightbox(cachedSrc); // also open immediately first time
            } else {
              setState('error', 'Не скачалось: ' + (r?.error || 'нет данных'));
              card.style.borderColor = 'rgba(255,92,92,.4)';
            }
          } catch (e) {
            setState('error', 'Ошибка: ' + e.message);
            card.style.borderColor = 'rgba(255,92,92,.4)';
          }
          return;
        }

        toast('Воспроизведение недоступно для этого видео', 'error');
      });
      return div;
    }
    case 'forwarded': {
      div.className = 'bubble-fwd';
      const author = a.author ? `Переслано от ${escapeHtml(a.author)}` : 'Пересланное сообщение';
      let html = `<div class="bubble-fwd__head">↻ ${author}</div>`;
      if (a.text) html += `<div class="bubble-fwd__body">${escapeHtml(a.text)}</div>`;
      div.innerHTML = html;
      let renderedSomething = !!a.text;
      for (const sub of (a.attachments || [])) {
        const node = renderAttachment(sub, chat, msg);
        if (node) { div.appendChild(node); renderedSomething = true; }
      }
      for (const sub of (a.nested || [])) {
        const node = renderAttachment(sub, chat, msg);
        if (node) { div.appendChild(node); renderedSomething = true; }
      }
      if (!renderedSomething) {
        const empty = document.createElement('div');
        empty.className = 'muted small';
        empty.style.cssText = 'padding:4px 0;font-style:italic';
        empty.textContent = '(содержимое скрыто настройками приватности)';
        div.appendChild(empty);
      }
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
      const fileName = a.title || ('file.' + (a.ext || 'bin'));
      div.innerHTML = `
        <div class="media-file">
          <div class="media-file__icon">${icon('paperclip', 20)}</div>
          <div style="min-width:0">
            <div class="media-file__name">${escapeHtml(fileName)}</div>
            <div class="media-file__size">${a.size ? humanSize(a.size) : (a.ext || '')}</div>
          </div>
          <button class="media-file__download" data-download title="Скачать">${icon('download', 16)}</button>
        </div>`;
      const fileEl = div.querySelector('.media-file');
      const downloadFile = async (e) => {
        e?.stopPropagation();
        try {
          fileEl.classList.add('is-loading');
          toast('Сохранение…', 'info', 1500);
          const ext = a.ext || (fileName.split('.').pop() || 'bin');
          const r = await api.media.saveAs({
            source: chat.source,
            externalChatId: chat.external_id,
            msgId: msg.external_id,
            kind: 'file',
            ext,
            name: fileName,
            url: a.url || null
          });
          if (r.ok && r.data) toast('Сохранено: ' + r.data, 'success', 4000);
        } catch (err) {
          toast('Не удалось скачать: ' + err.message, 'error');
        } finally {
          fileEl.classList.remove('is-loading');
        }
      };
      div.querySelector('[data-download]').addEventListener('click', downloadFile);
      fileEl.addEventListener('click', downloadFile);
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

function openLightbox(url) {
  openLightboxRaw(`<img src="${escapeHtml(url)}" alt=""/>`);
}

function openVideoLightbox({ src, type, fallbackUrl }) {
  let stage = '';
  if (type === 'iframe') {
    stage = `
      <div class="lightbox__stage">
        <iframe src="${escapeHtml(src)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>
        ${fallbackUrl ? `
          <div class="lightbox__fallback">
            <span>Если видео не воспроизводится здесь, в VK оно может быть приватным.</span>
            <button data-fallback>Открыть в браузере</button>
          </div>` : ''}
      </div>`;
  } else {
    stage = `<video src="${escapeHtml(src)}" controls autoplay></video>`;
  }
  openLightboxRaw(stage);
  if (fallbackUrl) {
    document.querySelector('.lightbox [data-fallback]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      api.openExternal(fallbackUrl);
    });
  }
}

function openLightboxRaw(innerHtml) {
  document.querySelectorAll('.lightbox').forEach(el => el.remove());
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<button class="lightbox__close" data-close>${icon('x', 18)}</button>${innerHtml}`;
  document.body.appendChild(lb);
  const close = () => lb.remove();
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target.closest('[data-close]')) close();
  });
  lb.querySelectorAll('img, video, iframe').forEach(el =>
    el.addEventListener('click', (e) => e.stopPropagation())
  );
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
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

function renderVoicePlayer(a, msg) {
  const seed = (msg.id || msg.external_id || 0) >>> 0;
  let s = seed || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0xffff) / 0xffff; };
  const bars = Array.from({ length: 28 }, () => {
    const h = 25 + Math.round(rnd() * 75);
    return `<div class="media-voice__wave-bar" style="height:${h}%"></div>`;
  }).join('');

  return `
    <div class="media-voice">
      <button class="media-voice__btn" data-play>${icon('play', 14)}</button>
      <div class="media-voice__bar" data-bar>
        <div class="media-voice__wave" data-wave>${bars}</div>
      </div>
      <div class="media-voice__time" data-time>${fmtDur(a.duration || 0)}</div>
      <button class="media-voice__transcribe" data-transcribe title="Расшифровать">${icon('mic', 13)}</button>
    </div>
    ${msg.transcript ? `<div class="media-voice__transcript" data-transcript-card>
      <div class="media-voice__transcript-head">
        <span class="media-voice__transcript-label">Расшифровка</span>
        <button class="media-voice__transcript-toggle" data-toggle-transcript title="Свернуть">▾</button>
      </div>
      <div class="media-voice__transcript-body" data-transcript-body>${escapeHtml(msg.transcript)}</div>
    </div>` : ''}`;
}

async function ensureVoiceUrl(a, chat, msg) {
  if (a.url) return a.url;
  if (a.tgRef && chat.source === 'tg') {
    const r = await api.media.download({
      source: 'tg', externalChatId: chat.external_id, msgId: msg.external_id, kind: 'voice', ext: 'ogg'
    });
    if (r.ok && r.data) return r.data;
    throw new Error(r.error || 'Не удалось скачать голосовое');
  }
  throw new Error('Источник голосового неизвестен');
}

function bindVoicePlayer(scope, a, chat, msg) {
  const btn = scope.querySelector('[data-play]');
  const transcribeBtn = scope.querySelector('[data-transcribe]');
  const time = scope.querySelector('[data-time]');
  const bar = scope.querySelector('[data-bar]');
  const waveBars = Array.from(scope.querySelectorAll('.media-voice__wave-bar'));
  let audio = null;

  function paintProgress(ratio) {
    const playedCount = Math.round(ratio * waveBars.length);
    waveBars.forEach((b, i) => b.classList.toggle('is-played', i < playedCount));
  }

  btn.addEventListener('click', async () => {
    if (!audio) {
      try {
        btn.innerHTML = icon('pause', 12);
        const src = await ensureVoiceUrl(a, chat, msg);
        audio = new Audio(src);
        audio.addEventListener('timeupdate', () => {
          if (audio.duration) {
            paintProgress(audio.currentTime / audio.duration);
          }
          time.textContent = fmtDur(audio.currentTime);
        });
        audio.addEventListener('ended', () => {
          btn.innerHTML = icon('play', 14);
          paintProgress(0);
          time.textContent = fmtDur(a.duration || 0);
        });
        audio.play();
      } catch (e) { toast('Не удалось воспроизвести: ' + e.message, 'error'); btn.innerHTML = icon('play', 14); }
      return;
    }
    if (audio.paused) { audio.play(); btn.innerHTML = icon('pause', 12); }
    else              { audio.pause(); btn.innerHTML = icon('play', 14); }
  });

  // Click on the waveform to seek
  bar.addEventListener('click', (e) => {
    if (!audio || !audio.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = audio.duration * ratio;
    paintProgress(ratio);
  });

  // Collapse / expand transcript (always look INSIDE scope to avoid grabbing
  // toggles from sibling bubbles)
  const toggleBtn = scope.querySelector('[data-toggle-transcript]');
  const transcriptBody = scope.querySelector('[data-transcript-body]');
  if (toggleBtn && transcriptBody) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const collapsed = transcriptBody.classList.toggle('is-collapsed');
      toggleBtn.textContent = collapsed ? '▸' : '▾';
      toggleBtn.title = collapsed ? 'Развернуть' : 'Свернуть';
    });
  }

  if (transcribeBtn) {
    transcribeBtn.addEventListener('click', async () => {
      const w = (await api.whisper.status()).data || {};
      if (!w.binaryReady || !w.modelReady) {
        toast('Сначала установите Whisper в Настройках', 'error');
        return;
      }
      transcribeBtn.classList.add('is-loading');
      try {
        const url = await ensureVoiceUrl(a, chat, msg);
        const wavBuffer = await audioUrlToWav16k(url);
        const r = await api.whisper.transcribe({
          wavBuffer, language: 'ru', messageId: msg.id
        });
        if (!r.ok) throw new Error(r.error);
        // Inject transcript block under the player
        const existing = scope.querySelector('.media-voice__transcript');
        const html = `<span class="media-voice__transcript-label">Расшифровка</span>${escapeHtml(r.data.text || '[пусто]')}`;
        if (existing) existing.innerHTML = html;
        else {
          const div = document.createElement('div');
          div.className = 'media-voice__transcript';
          div.innerHTML = html;
          scope.appendChild(div);
        }
        toast('Готово', 'success');
      } catch (e) {
        toast('Ошибка расшифровки: ' + e.message, 'error');
      } finally {
        transcribeBtn.classList.remove('is-loading');
      }
    });
  }
}

/**
 * Decode audio at any URL → resample to 16 kHz mono → encode 16-bit PCM WAV.
 * Returns ArrayBuffer ready for the Whisper CLI.
 */
async function audioUrlToWav16k(url) {
  const ab = await fetch(url).then(r => r.arrayBuffer());
  const decoded = await new AudioContext().decodeAudioData(ab.slice(0));
  // Resample to 16k mono via OfflineAudioContext
  const targetRate = 16000;
  const length = Math.ceil(decoded.duration * targetRate);
  const offline = new OfflineAudioContext(1, length, targetRate);
  const src = offline.createBufferSource();
  // Mix down to mono if needed
  if (decoded.numberOfChannels === 1) {
    src.buffer = decoded;
  } else {
    const monoBuf = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const out = monoBuf.getChannelData(0);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const data = decoded.getChannelData(ch);
      for (let i = 0; i < data.length; i++) out[i] += data[i] / decoded.numberOfChannels;
    }
    src.buffer = monoBuf;
  }
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), targetRate);
}

function encodeWav(pcm, sampleRate) {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  let o = 0;
  const writeStr = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i)); };
  writeStr('RIFF');
  view.setUint32(o, 36 + n * 2, true); o += 4;
  writeStr('WAVE');
  writeStr('fmt ');
  view.setUint32(o, 16, true);          o += 4;
  view.setUint16(o, 1, true);           o += 2;       // PCM
  view.setUint16(o, 1, true);           o += 2;       // mono
  view.setUint32(o, sampleRate, true);  o += 4;
  view.setUint32(o, sampleRate * 2, true); o += 4;    // byte rate
  view.setUint16(o, 2, true);           o += 2;       // block align
  view.setUint16(o, 16, true);          o += 2;       // bits per sample
  writeStr('data');
  view.setUint32(o, n * 2, true);       o += 4;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    o += 2;
  }
  return buf;
}

let pendingAttach = null;

function showAttachChip(view, file) {
  const composerWrap = $('.thread__composer', view);
  let preview = composerWrap.querySelector('.compose-attach-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'compose-attach-preview';
    composerWrap.insertBefore(preview, composerWrap.firstChild);
  }
  preview.innerHTML = `
    ${icon('paperclip', 14)}
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(file.name)}</span>
    <span class="muted small">${humanSize(file.size)}</span>
    <button data-cancel-attach>${icon('x', 12)}</button>
  `;
  preview.querySelector('[data-cancel-attach]').addEventListener('click', () => {
    pendingAttach = null;
    preview.remove();
  });
}

async function attachFile(view) {
  if (!activeChatId) { toast('Сначала откройте чат', 'error'); return; }
  const r = await api.inbox.pickFile();
  if (!r?.ok || !r.data) return;
  pendingAttach = r.data;
  showAttachChip(view, pendingAttach);
}

async function sendMessage(view) {
  if (!activeChatId) return;
  const ta = bind(view, 'composer');
  const text = ta.value.trim();
  const attachBtn = $('[data-action="attach"]', view);

  if (pendingAttach) {
    const file = pendingAttach;
    const caption = text;
    pendingAttach = null;
    ta.value = '';
    attachBtn.classList.add('is-pending');
    const sendBtn = $('[data-action="send"]', view);
    sendBtn.disabled = true;
    sendBtn.textContent = 'Отправляем…';
    try {
      const res = await api.inbox.sendFile({ chatRowId: activeChatId, filePath: file.path, caption });
      if (!res.ok) throw new Error(res.error);
      toast('Файл отправлен', 'success');
    } catch (e) {
      toast('Не отправлено: ' + e.message, 'error');
    } finally {
      attachBtn.classList.remove('is-pending');
      sendBtn.disabled = false;
      sendBtn.innerHTML = icon('send') + 'Отправить';
      $('.compose-attach-preview', view)?.remove();
    }
    await refreshChats(view);
    await refreshThreadMessages(view, activeChatId);
    return;
  }

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

  const hero = document.createElement('div');
  hero.className = 'bento-hero';
  const ini = initials(chat.title);
  const grad = avatarGradient(chat.title || chat.external_id || '');
  const avatarMarkup = chat.avatar_url
    ? `<img src="${escapeHtml(chat.avatar_url)}" alt="" onerror="this.parentNode.innerHTML='<span class=&quot;bento-hero__avatar-initials&quot;>${escapeHtml(ini)}</span>'"/>`
    : `<span class="bento-hero__avatar-initials">${escapeHtml(ini)}</span>`;

  hero.innerHTML = `
    <div class="bento-hero__stage">
      <div class="bento-hero__disc ${chat.source}"></div>
      ${ribbonSvg()}
      <div class="bento-hero__avatar" style="background:${grad}">${avatarMarkup}</div>
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

  // Media stats panel
  const msgsRes = await api.messages.list({ chatId: chat.id });
  const msgs = msgsRes.data || [];
  const stats = computeMediaStats(msgs);
  const mediaCard = document.createElement('div');
  mediaCard.className = 'card';
  const rows = MEDIA_CATEGORIES
    .filter(([key]) => stats[key] && stats[key].length)
    .map(([key, label, iconName]) => `
      <div class="media-stat" data-cat="${key}">
        <div class="media-stat__icon">${icon(iconName, 14)}</div>
        <div class="media-stat__label">${label}</div>
        <div class="media-stat__count">${stats[key].length}</div>
      </div>`).join('');
  mediaCard.innerHTML = `
    <div class="client-card__head"><div class="client-card__name" style="display:flex;align-items:center;gap:8px">${icon('image', 18)} Медиа в чате</div></div>
    ${rows ? `<div class="media-stats">${rows}</div>` : '<div class="muted small" style="margin-top:10px">Медиа пока нет</div>'}
  `;
  side.appendChild(mediaCard);
  mediaCard.querySelectorAll('.media-stat').forEach(el => {
    el.addEventListener('click', () => openMediaGallery(el.dataset.cat, stats[el.dataset.cat], chat));
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

const MEDIA_CATEGORIES = [
  ['photo',     'Фото',           'image'],
  ['video',     'Видео',          'paperclip'],
  ['voice',     'Голосовые',      'mic'],
  ['audio',     'Аудио',          'mic'],
  ['file',      'Файлы',          'paperclip'],
  ['link',      'Ссылки',         'link'],
  ['gif',       'GIF',            'image'],
  ['sticker',   'Стикеры',        'image']
];

function computeMediaStats(msgs) {
  const out = {};
  for (const [key] of MEDIA_CATEGORIES) out[key] = [];
  for (const m of msgs) {
    const att = Array.isArray(m.attachments) ? m.attachments : [];
    for (const a of att) {
      if (out[a.kind]) out[a.kind].push({ msg: m, att: a });
    }
    // Plain text URLs count as links
    const url = extractFirstUrl(m.body);
    if (url && !att.some(a => a.kind === 'link')) {
      out.link.push({ msg: m, att: { kind: 'link', url, title: url } });
    }
  }
  return out;
}

function openMediaGallery(category, items, chat) {
  document.querySelectorAll('.media-gallery').forEach(el => el.remove());
  const labels = Object.fromEntries(MEDIA_CATEGORIES.map(([k, l]) => [k, l]));
  const wrap = document.createElement('div');
  wrap.className = 'media-gallery';
  wrap.innerHTML = `
    <div class="media-gallery__head">
      <h2>${labels[category] || category} · ${items.length}</h2>
      <button class="media-gallery__close" data-close>${icon('x', 16)}</button>
    </div>
    <div class="media-gallery__grid" data-grid></div>
  `;
  document.body.appendChild(wrap);
  const grid = wrap.querySelector('[data-grid]');
  for (const it of items) {
    grid.appendChild(renderGalleryItem(category, it, chat));
  }
  wrap.querySelector('[data-close]').addEventListener('click', () => wrap.remove());
  wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { wrap.remove(); document.removeEventListener('keydown', esc); }
  });
}

function renderGalleryItem(category, { msg, att }, chat) {
  const div = document.createElement('div');
  if (category === 'photo' || category === 'sticker' || category === 'gif') {
    div.className = 'media-gallery__photo';
    if (att.url) {
      div.innerHTML = `<img src="${escapeHtml(att.url)}" loading="lazy" alt=""/>`;
      div.addEventListener('click', () => openLightbox(att.fullUrl || att.url));
    } else {
      div.innerHTML = `<div style="display:grid;place-content:center;height:100%;color:var(--text-muted);font-size:12px">${labels(category)} (без превью)</div>`;
    }
  } else if (category === 'video') {
    div.className = 'media-gallery__photo';
    if (att.previewUrl) div.innerHTML = `<img src="${escapeHtml(att.previewUrl)}" loading="lazy"/>`;
    else                div.innerHTML = `<div style="display:grid;place-content:center;height:100%;font-size:32px;color:var(--text-muted)">🎬</div>`;
    div.style.cursor = 'pointer';
    div.addEventListener('click', () => {
      if (att.tgRef && chat.source === 'tg') {
        api.media.download({ source: 'tg', externalChatId: chat.external_id, msgId: msg.external_id, kind: 'video', ext: 'mp4' })
          .then(r => { if (r.ok) openVideoLightbox({ src: r.data, type: 'mp4' }); });
      } else if (att.vkEmbedUrl) {
        openVideoLightbox({ src: att.vkEmbedUrl, type: 'iframe', fallbackUrl: att.vkUrl });
      }
    });
  } else if (category === 'voice' || category === 'audio') {
    div.className = 'media-gallery__file';
    div.innerHTML = `
      <div class="media-gallery__file-name">${icon('mic', 14)} ${category === 'voice' ? 'Голосовое' : (att.title || 'Аудио')}</div>
      <div class="media-gallery__file-meta">${att.duration ? fmtDur(att.duration) : ''} · ${fmtTime(msg.ts)}</div>`;
  } else if (category === 'file') {
    div.className = 'media-gallery__file';
    div.innerHTML = `
      <div class="media-gallery__file-name">${icon('paperclip', 14)} ${escapeHtml(att.title || 'Файл')}</div>
      <div class="media-gallery__file-meta">${att.size ? humanSize(att.size) : (att.ext || '')} · ${fmtTime(msg.ts)}</div>`;
    if (att.url) {
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => api.openExternal(att.url));
    }
  } else if (category === 'link') {
    div.className = 'media-gallery__file';
    div.innerHTML = `
      <div class="media-gallery__file-name">${icon('link', 14)} ${escapeHtml(att.title || att.url || '')}</div>
      <div class="media-gallery__file-meta" style="word-break:break-all">${escapeHtml(att.url || '')}</div>`;
    if (att.url) {
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => api.openExternal(att.url));
    }
  }
  return div;
}

function labels(c) {
  return Object.fromEntries(MEDIA_CATEGORIES.map(([k, l]) => [k, l]))[c] || c;
}

function ribbonSvg() {
  // Two arcs hugging the avatar circle from outside (top-left & bottom-right).
  // The arcs extend slightly past the disc so the ribbon-effect is visible
  // around the edges, but the lines never cross the centred avatar.
  return `
    <svg class="bento-hero__ribbon" viewBox="0 0 240 240" preserveAspectRatio="xMidYMid meet">
      <path d="M 18 120 C 30 56, 96 14, 156 22"
            fill="none" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0.92"/>
      <path d="M 222 118 C 212 184, 144 226, 84 220"
            fill="none" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
    </svg>`;
}
