/**
 * Convert raw VK / Telegram message objects into a normalized shape:
 *   { body, attachments, reply_to_text, reply_to_author }
 *
 * `body` — short human-readable text (used for chat preview).
 * `attachments` — array of structured attachment objects rendered by the UI:
 *   [{ kind, ... }]
 *
 *   kind ∈ 'photo' | 'voice' | 'audio' | 'video' | 'sticker' | 'gif' |
 *          'file' | 'link' | 'forwarded' | 'geo' | 'poll' | 'unknown'
 */

function fmtDuration(seconds = 0) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function pickLargestVkPhoto(photo) {
  if (!photo || !photo.sizes) return null;
  const sorted = photo.sizes.slice().sort((a, b) => (b.width || 0) - (a.width || 0));
  return sorted[0]?.url || null;
}
function pickPreviewVkPhoto(photo) {
  if (!photo || !photo.sizes) return null;
  // Prefer ~600px wide preview to keep memory low
  const small = photo.sizes
    .filter(s => (s.width || 0) >= 400 && (s.width || 0) <= 800)
    .sort((a, b) => (a.width || 0) - (b.width || 0))[0];
  return small?.url || pickLargestVkPhoto(photo);
}

// ─────────────────────────────────────── VK ───────────────────────────────────────
function extractVkAttachments(att) {
  if (!Array.isArray(att)) return [];
  const out = [];
  for (const a of att) {
    switch (a.type) {
      case 'photo':
        out.push({
          kind: 'photo',
          url: pickPreviewVkPhoto(a.photo),
          fullUrl: pickLargestVkPhoto(a.photo),
          width: a.photo?.sizes?.slice(-1)[0]?.width,
          height: a.photo?.sizes?.slice(-1)[0]?.height
        });
        break;
      case 'audio_message':
        out.push({
          kind: 'voice',
          url: a.audio_message?.link_mp3 || a.audio_message?.link_ogg,
          duration: a.audio_message?.duration || 0,
          waveform: a.audio_message?.waveform || null
        });
        break;
      case 'audio':
        out.push({
          kind: 'audio',
          url: a.audio?.url,
          title: a.audio?.title || '',
          artist: a.audio?.artist || '',
          duration: a.audio?.duration || 0
        });
        break;
      case 'video': {
        const v = a.video;
        const oid = v?.owner_id, vid = v?.id, key = v?.access_key;
        out.push({
          kind: 'video',
          previewUrl: pickPreviewVkPhoto({ sizes: v?.image }),
          title: v?.title || '',
          duration: v?.duration || 0,
          // VK locked direct mp4 in 2022 — we embed their iframe player
          // inside an in-app modal instead of opening the system browser.
          vkUrl: v ? `https://vk.com/video${oid}_${vid}${key ? '?list=' + key : ''}` : null,
          vkEmbedUrl: v ? `https://vk.com/video_ext.php?oid=${oid}&id=${vid}${key ? '&hash=' + key : ''}&hd=2` : null
        });
        break;
      }
      case 'sticker':
        out.push({
          kind: 'sticker',
          url: a.sticker?.images_with_background?.[3]?.url
            || a.sticker?.images?.[3]?.url
            || a.sticker?.images?.[0]?.url
        });
        break;
      case 'doc': {
        const d = a.doc;
        const isGif = d?.ext === 'gif' || d?.type === 3;
        if (isGif) {
          out.push({ kind: 'gif', url: d?.url, previewUrl: d?.preview?.photo?.sizes?.slice(-1)[0]?.src });
        } else {
          out.push({
            kind: 'file',
            url: d?.url,
            title: d?.title || 'Файл',
            ext: d?.ext || '',
            size: d?.size || 0
          });
        }
        break;
      }
      case 'link':
        out.push({ kind: 'link', url: a.link?.url, title: a.link?.title || '', desc: a.link?.description || '' });
        break;
      case 'wall':
        out.push({ kind: 'link', url: `https://vk.com/wall${a.wall?.from_id}_${a.wall?.id}`, title: 'Запись на стене', desc: a.wall?.text?.slice(0, 200) || '' });
        break;
      case 'poll':
        out.push({ kind: 'poll', question: a.poll?.question || '' });
        break;
      default:
        out.push({ kind: 'unknown', type: a.type });
    }
  }
  return out;
}

function composeVkBody({ text, attachments, geo, fwd_messages, reply_message } = {}) {
  const parts = [];
  if (text) parts.push(text);
  const items = extractVkAttachments(attachments);
  for (const a of items) {
    if (a.kind === 'photo') parts.push('📷 Фото');
    else if (a.kind === 'voice') parts.push(`🎤 Голосовое (${fmtDuration(a.duration)})`);
    else if (a.kind === 'audio') parts.push(`🎵 ${a.artist || ''} – ${a.title || ''}`.trim());
    else if (a.kind === 'video') parts.push(`🎬 Видео${a.title ? ' — ' + a.title : ''}`);
    else if (a.kind === 'sticker') parts.push('🌟 Стикер');
    else if (a.kind === 'gif') parts.push('🎞 GIF');
    else if (a.kind === 'file') parts.push(`📎 ${a.title}`);
    else if (a.kind === 'link') parts.push(`🔗 ${a.title || a.url}`);
    else if (a.kind === 'poll') parts.push(`📊 Опрос: ${a.question}`);
  }
  if (geo) parts.push('📍 Геолокация');
  if (Array.isArray(fwd_messages) && fwd_messages.length) {
    parts.push(`↻ ${fwd_messages.length} пересланных`);
  }
  return parts.join(' · ').slice(0, 200) || (reply_message ? '↪️ Ответ' : '[пустое сообщение]');
}

function extractVkForwarded(fwds, profiles = [], groups = []) {
  if (!Array.isArray(fwds) || !fwds.length) return [];
  return fwds.map(f => {
    let author = null;
    if (f.from_id > 0) {
      const p = profiles.find(p => p.id === f.from_id);
      if (p) author = `${p.first_name} ${p.last_name}`;
    } else if (f.from_id < 0) {
      const g = groups.find(g => g.id === Math.abs(f.from_id));
      if (g) author = g.name;
    }
    return {
      kind: 'forwarded',
      text: f.text || '',
      author,
      fromId: f.from_id,
      date: (f.date || 0) * 1000,
      attachments: extractVkAttachments(f.attachments || []),
      nested: extractVkForwarded(f.fwd_messages || [], profiles, groups)
    };
  });
}

function normalizeVkMessage(m, profiles = [], groups = []) {
  const att = extractVkAttachments(m.attachments);
  const fwds = extractVkForwarded(m.fwd_messages, profiles, groups);
  let reply_to_text = null, reply_to_author = null;
  if (m.reply_message) {
    reply_to_text = m.reply_message.text?.slice(0, 200) || '';
    const fromId = m.reply_message.from_id;
    if (fromId > 0) {
      const p = profiles.find(p => p.id === fromId);
      if (p) reply_to_author = `${p.first_name} ${p.last_name}`;
    } else if (fromId < 0) {
      const g = groups.find(g => g.id === Math.abs(fromId));
      if (g) reply_to_author = g.name;
    }
  }
  return {
    body: composeVkBody({
      text: m.text,
      attachments: m.attachments,
      geo: m.geo,
      fwd_messages: m.fwd_messages,
      reply_message: m.reply_message
    }),
    attachments: [...att, ...fwds],
    reply_to_text,
    reply_to_author
  };
}

// ─────────────────────────────────────── Telegram ─────────────────────────────────
function tgClassName(obj) { return (obj && obj.className) || ''; }

function extractTgAttachments(msg) {
  const media = msg?.media;
  if (!media) return [];
  const cls = tgClassName(media);

  if (cls.includes('Photo')) {
    return [{ kind: 'photo', tgRef: { kind: 'photo', msgId: msg.id, chatId: tgChatRef(msg) } }];
  }
  if (cls.includes('Document')) {
    const doc = media.document;
    const attrs = (doc && doc.attributes) || [];
    const audio = attrs.find(a => tgClassName(a) === 'DocumentAttributeAudio');
    const video = attrs.find(a => tgClassName(a) === 'DocumentAttributeVideo');
    const sticker = attrs.find(a => tgClassName(a) === 'DocumentAttributeSticker');
    const animated = attrs.find(a => tgClassName(a) === 'DocumentAttributeAnimated');
    const filename = attrs.find(a => tgClassName(a) === 'DocumentAttributeFilename');

    if (audio && audio.voice) {
      return [{ kind: 'voice', duration: audio.duration || 0, tgRef: { kind: 'voice', msgId: msg.id, chatId: tgChatRef(msg) } }];
    }
    if (audio) {
      return [{ kind: 'audio', duration: audio.duration || 0, title: audio.title || '', artist: audio.performer || '', tgRef: { kind: 'audio', msgId: msg.id, chatId: tgChatRef(msg) } }];
    }
    if (video && video.roundMessage) {
      return [{ kind: 'video', round: true, duration: video.duration || 0, tgRef: { kind: 'video', msgId: msg.id, chatId: tgChatRef(msg) } }];
    }
    if (video) {
      return [{ kind: 'video', duration: video.duration || 0, tgRef: { kind: 'video', msgId: msg.id, chatId: tgChatRef(msg) } }];
    }
    if (sticker) {
      return [{ kind: 'sticker', alt: sticker.alt || '' }];
    }
    if (animated) {
      return [{ kind: 'gif', tgRef: { kind: 'gif', msgId: msg.id, chatId: tgChatRef(msg) } }];
    }
    return [{ kind: 'file', title: filename?.fileName || 'Файл', size: Number(doc?.size || 0), tgRef: { kind: 'file', msgId: msg.id, chatId: tgChatRef(msg) } }];
  }
  if (cls.includes('Geo')) return [{ kind: 'geo' }];
  if (cls.includes('Contact')) return [{ kind: 'unknown', type: 'contact' }];
  if (cls.includes('Poll')) return [{ kind: 'poll', question: media.poll?.question || '' }];
  if (cls.includes('WebPage')) {
    const wp = media.webpage;
    return [{ kind: 'link', url: wp?.url, title: wp?.title || '', desc: wp?.description || '' }];
  }
  return [];
}

function tgChatRef(msg) {
  if (!msg || !msg.peerId) return null;
  if (msg.peerId.userId)    return String(msg.peerId.userId);
  if (msg.peerId.chatId)    return String(msg.peerId.chatId);
  if (msg.peerId.channelId) return String(msg.peerId.channelId);
  return null;
}

function composeTgBody(msg) {
  let text = msg?.message || '';
  const items = extractTgAttachments(msg);
  const tags = [];
  for (const a of items) {
    if (a.kind === 'photo') tags.push('📷 Фото');
    else if (a.kind === 'voice') tags.push(`🎤 Голосовое (${fmtDuration(a.duration)})`);
    else if (a.kind === 'audio') tags.push(`🎵 ${a.artist || ''} – ${a.title || ''}`.trim());
    else if (a.kind === 'video') tags.push(a.round ? `📹 Кружок (${fmtDuration(a.duration)})` : '🎬 Видео');
    else if (a.kind === 'sticker') tags.push(`🌟 Стикер ${a.alt || ''}`.trim());
    else if (a.kind === 'gif') tags.push('🎞 GIF');
    else if (a.kind === 'file') tags.push(`📎 ${a.title}`);
    else if (a.kind === 'link') tags.push(`🔗 ${a.title || a.url}`);
    else if (a.kind === 'geo') tags.push('📍 Геолокация');
    else if (a.kind === 'poll') tags.push(`📊 Опрос: ${a.question}`);
  }
  if (tags.length && text) return `${text} · ${tags.join(' · ')}`.slice(0, 200);
  if (tags.length) return tags.join(' · ').slice(0, 200);
  return text || '[пустое сообщение]';
}

function tgForwardHeader(fwd) {
  if (!fwd) return null;
  const name = fwd.fromName
            || fwd.fromId?.userId
            || fwd.fromId?.channelId
            || fwd.fromId?.chatId
            || null;
  return name ? String(name) : 'кого-то';
}

function normalizeTgMessage(msg) {
  let reply_to_text = null;
  if (msg.replyToMsgId && msg.replyTo) {
    reply_to_text = '';
  }
  const att = extractTgAttachments(msg);
  // TG forwards: the message itself IS the forwarded content. Mark with
  // a 'forwarded' attachment that wraps the bubble's own body+media so
  // the renderer shows a proper "Переслано от X" block.
  if (msg.fwdFrom) {
    att.unshift({
      kind: 'forwarded',
      text: msg.message || '',
      author: tgForwardHeader(msg.fwdFrom),
      attachments: att.slice(), // existing media (will be excluded from main bubble)
      nested: [],
      _consumeBody: true        // tell renderer to suppress duplicate body
    });
  }
  return {
    body: composeTgBody(msg),
    attachments: att,
    reply_to_text,
    reply_to_author: null
  };
}

module.exports = {
  composeVkBody,
  composeTgBody,
  normalizeVkMessage,
  normalizeTgMessage,
  extractVkAttachments,
  extractTgAttachments,
  fmtDuration
};
