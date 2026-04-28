import { tpl, $, $$, bind } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { openStep } from './onboarding.js';

const api = window.omnidesk;

function fmtMb(bytes) { return (bytes / 1024 / 1024).toFixed(1) + ' MB'; }

export async function renderSettings(host, { injectIcons }) {
  host.innerHTML = '';
  const view = tpl('tpl-view-settings');
  host.appendChild(view);
  injectIcons(view);

  const refresh = async () => {
    const status = (await api.status()).data;
    bind(view, 'proxy-current').textContent = status.proxy && status.proxy.type !== 'none'
      ? `${status.proxy.type.toUpperCase()} · ${status.proxy.host}:${status.proxy.port}`
      : 'не настроен';
    bind(view, 'tg-current').textContent = status.telegram.connected ? 'подключён ✓' : 'не подключён';
    bind(view, 'vk-current').textContent = status.vk.connected      ? 'подключён ✓' : 'не подключён';
  };

  $('[data-action="proxy"]', view).addEventListener('click', () => openStep('proxy', refresh));
  $('[data-action="tg-connect"]', view).addEventListener('click', () => openStep('telegram', refresh));
  $('[data-action="vk-connect"]', view).addEventListener('click', () => openStep('vk', refresh));
  $('[data-action="tg-logout"]', view).addEventListener('click', async () => {
    if (!confirm('Отключить Telegram?')) return;
    const r = await api.telegram.logout();
    if (r.ok) { toast('Telegram отключён', 'success'); refresh(); }
  });
  $('[data-action="vk-logout"]', view).addEventListener('click', async () => {
    if (!confirm('Отключить ВКонтакте?')) return;
    const r = await api.vk.logout();
    if (r.ok) { toast('VK отключён', 'success'); refresh(); }
  });

  // OTA updater
  const updaterStatus = bind(view, 'updater-status');
  const updaterWrap   = bind(view, 'updater-progress-wrap');
  const updaterBar    = bind(view, 'updater-progress-bar');
  const checkBtn      = $('[data-action="updater-check"]', view);
  const installBtn    = $('[data-action="updater-install"]', view);

  function paintUpdaterState(s) {
    if (!s) return;
    const ver = s.currentVersion ? ` (текущая ${s.currentVersion})` : '';
    if (s.status === 'idle')        updaterStatus.textContent = 'Не проверялось' + ver;
    if (s.status === 'checking')    updaterStatus.textContent = 'Проверяем GitHub…' + ver;
    if (s.status === 'up-to-date')  updaterStatus.textContent = `✓ Установлена последняя версия ${s.currentVersion}`;
    if (s.status === 'downloading') updaterStatus.textContent = `⬇ Загружается ${s.newVersion} · ${s.progress || 0}%`;
    if (s.status === 'ready')       updaterStatus.textContent = `✅ Версия ${s.newVersion} готова к установке`;
    if (s.status === 'error')       updaterStatus.textContent = '⚠ Ошибка: ' + (s.error || 'неизвестно');

    updaterWrap.hidden = s.status !== 'downloading';
    if (s.status === 'downloading') updaterBar.style.width = (s.progress || 0) + '%';

    installBtn.hidden = s.status !== 'ready';
    checkBtn.disabled = s.status === 'checking' || s.status === 'downloading';
  }

  api.updater.state().then(r => paintUpdaterState(r?.data));
  api.on('updater:state', paintUpdaterState);
  checkBtn.addEventListener('click', async () => {
    paintUpdaterState({ status: 'checking', currentVersion: (await api.updater.state()).data?.currentVersion });
    const r = await api.updater.check();
    if (r?.data) paintUpdaterState(r.data);
  });
  installBtn.addEventListener('click', async () => {
    if (!confirm('Установить обновление? Приложение перезапустится.')) return;
    await api.updater.install();
  });

  // Auto-download media toggle
  const autoToggle = bind(view, 'autoload-toggle');
  if (autoToggle) {
    autoToggle.checked = localStorage.getItem('omnidesk:autoMedia') === '1';
    autoToggle.addEventListener('change', () => {
      localStorage.setItem('omnidesk:autoMedia', autoToggle.checked ? '1' : '0');
      toast(autoToggle.checked ? 'Автозагрузка включена' : 'Автозагрузка выключена', 'success', 1800);
    });
  }

  // Whisper install + status
  const refreshWhisper = async () => {
    const s = (await api.whisper.status()).data || {};
    const label = bind(view, 'whisper-status');
    const btn   = $('[data-action="whisper-install"]', view);
    if (s.binaryReady && s.modelReady) {
      label.textContent = `✓ установлено (модель ${s.modelSizeMb} MB)`;
      btn.textContent = 'Переустановить';
      btn.classList.remove('btn--primary');
      btn.classList.add('btn--ghost');
    } else {
      const need = [];
      if (!s.binaryReady) need.push('CLI');
      if (!s.modelReady)  need.push('модель');
      label.textContent = `не установлено (нужны: ${need.join(', ')})`;
    }
  };
  refreshWhisper();

  $('[data-action="whisper-install"]', view).addEventListener('click', async () => {
    const wrap = bind(view, 'whisper-progress-wrap');
    const lbl  = bind(view, 'whisper-progress-label');
    const bar  = bind(view, 'whisper-progress-bar');
    wrap.hidden = false;
    lbl.textContent = 'Подготовка…';

    const off = api.on('whisper:progress', (p) => {
      if (p.stage === 'binary') {
        const pct = p.total ? Math.round(p.received / p.total * 100) : 0;
        lbl.textContent = `Скачивание whisper.cpp · ${fmtMb(p.received)} / ${p.total ? fmtMb(p.total) : '?'} (${pct}%)`;
        bar.style.width = pct + '%';
      } else if (p.stage === 'model') {
        const pct = p.total ? Math.round(p.received / p.total * 100) : 0;
        lbl.textContent = `Скачивание модели ggml-base · ${fmtMb(p.received)} / ${p.total ? fmtMb(p.total) : '?'} (${pct}%)`;
        bar.style.width = pct + '%';
      } else if (p.stage === 'done') {
        lbl.textContent = '✓ Готово';
        bar.style.width = '100%';
      }
    });

    try {
      const r = await api.whisper.downloadModel();
      if (!r.ok) throw new Error(r.error);
      toast('Whisper установлен', 'success');
      setTimeout(() => { wrap.hidden = true; refreshWhisper(); off && off(); }, 1200);
    } catch (e) {
      toast('Ошибка установки: ' + e.message, 'error');
      lbl.textContent = 'Ошибка: ' + e.message;
    }
  });

  // Wallpaper picker
  renderWallpapers(view);

  await refresh();
}

const WALLPAPERS = [
  { id: 'default',  label: 'По умолчанию', preview: 'linear-gradient(135deg, #11141B 0%, #0B0D12 100%)' },
  { id: 'black',    label: 'Чёрный',       preview: '#000' },
  { id: 'graphite', label: 'Графит',       preview: '#1a1d24' },
  { id: 'midnight', label: 'Полночь',      preview: 'linear-gradient(135deg, #1a2050 0%, #08082a 100%)' },
  { id: 'ocean',    label: 'Океан',        preview: 'linear-gradient(135deg, #0a3d5c 0%, #062f4a 100%)' },
  { id: 'dusk',     label: 'Сумерки',      preview: 'linear-gradient(135deg, #2a1a3a 0%, #1a0e2a 100%)' },
  { id: 'paper',    label: 'Бумага',       preview: '#ECEDEF' },
  { id: 'warm',     label: 'Тёплый',       preview: '#F4ECE0' }
];

function applyWallpaper(id) {
  document.documentElement.dataset.wallpaper = id;
  localStorage.setItem('omnidesk:wallpaper', id);
}

export function initWallpaper() {
  const saved = localStorage.getItem('omnidesk:wallpaper') || 'default';
  applyWallpaper(saved);
}

function renderWallpapers(view) {
  const grid = bind(view, 'wallpaper-grid');
  if (!grid) return;
  const current = localStorage.getItem('omnidesk:wallpaper') || 'default';
  for (const w of WALLPAPERS) {
    const tile = document.createElement('div');
    tile.className = 'wallpaper-tile' + (w.id === current ? ' is-active' : '');
    tile.style.background = w.preview;
    tile.title = w.label;
    tile.addEventListener('click', () => {
      applyWallpaper(w.id);
      grid.querySelectorAll('.wallpaper-tile').forEach(t => t.classList.remove('is-active'));
      tile.classList.add('is-active');
      toast('Фон: ' + w.label, 'success', 1500);
    });
    grid.appendChild(tile);
  }
}
