/**
 * OmniDesk SVG icon set — handcrafted, inline. All 24×24 viewBox, stroke-based,
 * inherit currentColor. Match the brand icon's clean geometric look.
 */

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  inbox: `<path ${STROKE} d="M21 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5.5L5.7 4.7A2 2 0 0 1 7.6 3.3h8.8a2 2 0 0 1 1.9 1.4L21 13.5Z M3 13.5h5l1.5 2.5h5L16 13.5h5"/>`,
  crm: `<circle cx="9" cy="8" r="3.5" ${STROKE}/><path ${STROKE} d="M3 20c.7-3.4 3-5.5 6-5.5s5.3 2.1 6 5.5"/><circle cx="17" cy="6.5" r="2.5" ${STROKE}/><path ${STROKE} d="M21.5 17c-.4-2.1-1.7-3.5-3.5-3.8"/>`,
  notes: `<path ${STROKE} d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path ${STROKE} d="M16 4v3h3M8 11h8M8 15h8M8 19h5"/>`,
  settings: `<circle cx="12" cy="12" r="3" ${STROKE}/><path ${STROKE} d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>`,

  pin: `<path ${STROKE} d="M12 2v6m0 0L8 12h8l-4-4Zm0 6v8m-3 6h6"/>`,
  'pin-off': `<path ${STROKE} d="M3 3l18 18M9 4h6m-3 0v3.5M16.5 12 17 8H7l.5 4M9 16h6l-3 6"/>`,

  check: `<path ${STROKE} d="M5 12.5l4.5 4.5L19 7"/>`,
  send: `<path ${STROKE} d="M3 11l18-8-8 18-2-7-8-3Z"/>`,
  user: `<circle cx="12" cy="8" r="4" ${STROKE}/><path ${STROKE} d="M4 21c1-4.4 4-7 8-7s7 2.6 8 7"/>`,
  link: `<path ${STROKE} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path ${STROKE} d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
  search: `<circle cx="11" cy="11" r="7" ${STROKE}/><path ${STROKE} d="M20 20l-3.5-3.5"/>`,
  plus: `<path ${STROKE} d="M12 5v14M5 12h14"/>`,
  trash: `<path ${STROKE} d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v7M14 11v7"/>`,
  edit: `<path ${STROKE} d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z M14 6l4 4"/>`,
  more: `<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>`,
  play: `<path d="M8 5v14l11-7z" fill="currentColor"/>`,
  pause: `<path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/>`,
  x: `<path ${STROKE} d="M6 6l12 12M18 6L6 18"/>`,
  globe: `<circle cx="12" cy="12" r="9" ${STROKE}/><path ${STROKE} d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>`,
  shield: `<path ${STROKE} d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3Z"/><path ${STROKE} d="M9 12l2 2 4-4"/>`,
  bell: `<path ${STROKE} d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0"/>`,
  chat: `<path ${STROKE} d="M21 12a8 8 0 0 1-12 7l-5 1.5L5.5 16A8 8 0 1 1 21 12Z"/>`,
  paperclip: `<path ${STROKE} d="M21 12.5L12.5 21a5.5 5.5 0 1 1-7.8-7.8l8.5-8.5a3.7 3.7 0 1 1 5.2 5.2L9.4 18.4a1.8 1.8 0 1 1-2.6-2.6l7.8-7.8"/>`,
  mic: `<rect x="9" y="3" width="6" height="12" rx="3" ${STROKE}/><path ${STROKE} d="M5 11a7 7 0 0 0 14 0M12 18v3"/>`,
  image: `<rect x="3" y="3" width="18" height="18" rx="3" ${STROKE}/><circle cx="9" cy="9" r="2" ${STROKE}/><path ${STROKE} d="M3 17l5-5 4 4 4-3 5 4"/>`,

  // Brand glyphs (used inside avatar source-marker badge)
  tg: `<path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" fill="currentColor"/>`,
  vk: `<path d="M2.95 7.13c.13-.43.43-.6.96-.6h2.45c.59 0 .8.27.94.7 0 0 1.21 3.55 2.83 5.85.63.91 1.07.95 1.4.66.65-.55.51-3.4.51-3.4-.04-.92-.27-1.34-.79-1.55-.32-.13-.04-.5.4-.6.86-.18 2.99-.18 4.04-.04.6.08.85.41.85 1.16v3.43c0 .57.27.78.45.78.34 0 .58-.21.96-.6.96-1.07 1.66-2.74 1.99-3.93.1-.35.36-.5.81-.5h2.34c.7 0 .85.36.7.85-.36 1.51-2.04 4.06-2.71 5.04-.32.51-.43.74 0 1.31.32.42 1.43 1.42 2.04 2.13.7.85 1.21 1.55.36 1.96-.34.16-1.92.16-3.28-.43-.85-.36-1.55-.92-2.34-1.66-1.07-1.04-1.5-1.27-1.78-1.04-.27.21-.32.6-.32 1.43v.95c0 .57-.18.92-1.42.92-2.06 0-4.34-1.27-5.97-3.6C4.21 12.16 2.81 8.41 2.95 7.13z" fill="currentColor"/>`
};

export function icon(name, size = 18) {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
}
