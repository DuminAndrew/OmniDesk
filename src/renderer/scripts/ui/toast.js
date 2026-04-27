const host = () => document.getElementById('toasts');

export function toast(message, kind = 'info', timeout = 3500) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host().appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, timeout);
}
