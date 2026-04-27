import { tpl, $, $$, bind } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { openStep } from './onboarding.js';

const api = window.omnidesk;

export async function renderSettings(host) {
  host.innerHTML = '';
  const view = tpl('tpl-view-settings');
  host.appendChild(view);

  const refresh = async () => {
    const status = (await api.status()).data;
    bind(view, 'proxy-current').textContent = status.proxy && status.proxy.type !== 'none'
      ? `${status.proxy.type.toUpperCase()} · ${status.proxy.host}:${status.proxy.port}`
      : 'не настроен';
    bind(view, 'tg-current').textContent = status.telegram.connected ? 'подключён ✓' : 'не подключён';
    bind(view, 'vk-current').textContent = status.vk.connected ? 'подключён ✓' : 'не подключён';
  };

  $('[data-action="proxy"]', view).addEventListener('click', () => openStep('proxy', refresh));
  $('[data-action="tg-connect"]', view).addEventListener('click', () => openStep('telegram', refresh));
  $('[data-action="vk-connect"]', view).addEventListener('click', () => openStep('vk', refresh));

  $('[data-action="tg-logout"]', view).addEventListener('click', async () => {
    if (!confirm('Отключить Telegram? Сессия будет удалена.')) return;
    const r = await api.telegram.logout();
    if (r.ok) { toast('Telegram отключён', 'success'); refresh(); }
  });
  $('[data-action="vk-logout"]', view).addEventListener('click', async () => {
    if (!confirm('Отключить ВКонтакте?')) return;
    const r = await api.vk.logout();
    if (r.ok) { toast('VK отключён', 'success'); refresh(); }
  });

  await refresh();
}
