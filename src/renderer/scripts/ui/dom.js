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
