import { tpl, $, $$, bind } from './ui/dom.js';
import { toast } from './ui/toast.js';
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

async function boot() {
  const status = (await api.status()).data;
  const hasAnyConnection = status.telegram.connected || status.vk.connected || status.hasTelegramSession || status.hasVkToken;

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

  const host = $('[data-view-host]', shell);
  $$('.nav-item', shell).forEach(btn => {
    btn.addEventListener('click', async () => {
      $$('.nav-item', shell).forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      await VIEWS[btn.dataset.view](host);
    });
  });

  // Status pills
  const tgPill = $('[data-conn="tg"]', shell);
  const vkPill = $('[data-conn="vk"]', shell);
  const reflect = (pill, on) => pill.classList.toggle('is-connected', !!on);
  api.on('tg:status', (s) => reflect(tgPill, s.connected));
  api.on('vk:status', (s) => reflect(vkPill, s.connected));
  const init = (await api.status()).data;
  reflect(tgPill, init.telegram.connected);
  reflect(vkPill, init.vk.connected);

  api.on('inbox:newMessage', () => {
    // could show toast — for now silent (native notif handles UX)
  });

  await VIEWS.inbox(host);
}

boot().catch(err => {
  console.error(err);
  toast('Ошибка запуска: ' + err.message, 'error');
});
