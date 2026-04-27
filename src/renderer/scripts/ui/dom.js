export function tpl(id) {
  const t = document.getElementById(id);
  return t.content.firstElementChild.cloneNode(true);
}
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

export function bind(root, key) {
  return root.querySelector(`[data-bind="${key}"]`);
}

export function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString();
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

const STATUS_LABELS = {
  new: 'Новый', in_progress: 'В работе', closed: 'Закрыт', rejected: 'Отказ'
};
export function statusLabel(s) { return STATUS_LABELS[s] || s; }

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Deterministic gradient color per string — for fallback avatars
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #FF7A45, #E84F1A)',
  'linear-gradient(135deg, #00C6FF, #0072FF)',
  'linear-gradient(135deg, #B06AB3, #4568DC)',
  'linear-gradient(135deg, #43cea2, #185a9d)',
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #30cfd0, #330867)',
  'linear-gradient(135deg, #a8edea, #fed6e3)',
  'linear-gradient(135deg, #ffecd2, #fcb69f)',
  'linear-gradient(135deg, #84fab0, #8fd3f4)'
];
export function avatarGradient(seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
