import { tpl, $, $$, bind } from './ui/dom.js';
import { toast } from './ui/toast.js';
import { icon } from './ui/icons.js';
import { renderOnboarding } from './modules/onboarding.js';
import { renderInbox } from './modules/inbox.js';
import { renderCRM } from './modules/crm.js';
import { renderNotes } from './modules/notes.js';
import { renderSettings } from './modules/settings.js';

const api = window.omnidesk;
const root = document.getElementById('app');

const VIEWS = {
  inbox:    renderInbox,
  crm:      renderCRM,
  notes:    renderNotes,
  settings: renderSettings
};

function injectIcons(scope = document) {
  for (const el of scope.querySelectorAll('[data-icon]')) {
    const name = el.dataset.icon;
    const size = Number(el.dataset.iconSize || 18);
    el.innerHTML = icon(name, size);
  }
}

async function boot() {
  const status = (await api.status()).data;
  const hasAnyConnection =
    status.telegram.connected || status.vk.connected ||
    status.hasTelegramSession || status.hasVkToken;

  if (!hasAnyConnection) {
    await renderOnboarding(root, { onEnterApp: enterApp });
  } else {
    await enterApp();
  }
}

async function enterApp() {
  root.innerHTML = '';
  const shell = tpl('tpl-app-shell');
  root.appendChild(shell);
  injectIcons(shell);

  const host = $('[data-view-host]', shell);
  $$('.nav-item', shell).forEach(btn => {
    btn.addEventListener('click', async () => {
      $$('.nav-item', shell).forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      await VIEWS[btn.dataset.view](host, { injectIcons });
    });
  });

  const tgPill = $('[data-conn="tg"]', shell);
  const vkPill = $('[data-conn="vk"]', shell);
  const reflect = (pill, on) => pill.classList.toggle('is-connected', !!on);
  api.on('tg:status', (s) => reflect(tgPill, s.connected));
  api.on('vk:status', (s) => reflect(vkPill, s.connected));
  const init = (await api.status()).data;
  reflect(tgPill, init.telegram.connected);
  reflect(vkPill, init.vk.connected);

  await VIEWS.inbox(host, { injectIcons });
}

window.__omnidesk_injectIcons = injectIcons;

boot().catch(err => {
  console.error(err);
  toast('Ошибка запуска: ' + err.message, 'error');
});
