import { tpl, $, $$, bind } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

const api = window.omnidesk;

export async function renderOnboarding(host, { onEnterApp }) {
  host.innerHTML = '';
  const node = tpl('tpl-onboarding');
  host.appendChild(node);

  await refreshLabels(node);

  $$('button.step-card', node).forEach(btn => {
    btn.addEventListener('click', () => openStep(btn.dataset.step, () => refreshLabels(node)));
  });

  $('[data-action="enter-app"]', node).addEventListener('click', () => onEnterApp());
}

async function refreshLabels(root) {
  const status = (await api.status()).data;
  const proxyEl = bind(root, 'proxy-status');
  const tgEl    = bind(root, 'tg-status');
  const vkEl    = bind(root, 'vk-status');
  if (proxyEl) proxyEl.textContent = status.proxy && status.proxy.type !== 'none'
                ? `${status.proxy.type.toUpperCase()} · ${status.proxy.host}:${status.proxy.port}`
                : 'не настроен';
  if (tgEl) tgEl.textContent = status.telegram.connected ? 'подключён ✓' : (status.hasTelegramSession ? 'сессия сохранена' : 'не подключён');
  if (vkEl) vkEl.textContent = status.vk.connected      ? 'подключён ✓' : (status.hasVkToken ? 'токен сохранён' : 'не подключён');
}

export function openStep(step, onClose) {
  if (step === 'proxy')    return openProxyModal(onClose);
  if (step === 'telegram') return openTelegramModal(onClose);
  if (step === 'vk')       return openVkModal(onClose);
}

// ─── Proxy modal ────────────────────────────────────────────────
async function openProxyModal(onClose) {
  const node = tpl('tpl-proxy-modal');
  document.body.appendChild(node);
  const close = () => { node.remove(); onClose && onClose(); };

  const cur = (await api.proxy.get()).data || { type: 'none' };
  const typeSel = node.querySelector('[data-field="type"]');
  typeSel.value = cur.type || 'none';
  node.querySelector('[data-field="host"]').value = cur.host || '';
  node.querySelector('[data-field="port"]').value = cur.port || '';
  node.querySelector('[data-field="secret"]').value = cur.secret || '';
  node.querySelector('[data-field="username"]').value = cur.username || '';
  node.querySelector('[data-field="password"]').value = cur.password || '';

  const reflectVisibility = () => {
    $$('[data-only]', node).forEach(el => {
      el.hidden = el.dataset.only !== typeSel.value;
    });
  };
  typeSel.addEventListener('change', reflectVisibility);
  reflectVisibility();

  node.querySelector('[data-action="cancel"]').addEventListener('click', close);
  node.querySelector('[data-action="save"]').addEventListener('click', async () => {
    const cfg = {
      type: typeSel.value,
      host: node.querySelector('[data-field="host"]').value.trim(),
      port: Number(node.querySelector('[data-field="port"]').value),
      secret: node.querySelector('[data-field="secret"]').value.trim(),
      username: node.querySelector('[data-field="username"]').value.trim(),
      password: node.querySelector('[data-field="password"]').value
    };
    if (cfg.type !== 'none' && (!cfg.host || !cfg.port)) {
      toast('Укажите хост и порт', 'error'); return;
    }
    if (cfg.type === 'mtproxy' && !cfg.secret) {
      toast('Для MTProxy нужен secret', 'error'); return;
    }
    const res = await api.proxy.save(cfg);
    if (!res.ok) return toast('Ошибка: ' + res.error, 'error');
    toast('Прокси сохранён. Применится при следующем подключении Telegram.', 'success');
    close();
  });
}

// ─── Telegram modal ─────────────────────────────────────────────
function openTelegramModal(onClose) {
  const node = tpl('tpl-tg-modal');
  document.body.appendChild(node);
  const close = () => { node.remove(); onClose && onClose(); };

  const stage = (name) => {
    $$('[data-stage]', node).forEach(s => s.hidden = s.dataset.stage !== name);
  };
  const setStatus = (msg, kind = '') => {
    stage('status');
    const el = bind(node, 'status-msg');
    el.className = 'status-msg ' + kind;
    el.textContent = msg;
  };

  $$('[data-link]', node).forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); api.openExternal(a.dataset.link); });
  });
  node.querySelector('[data-action="cancel"]').addEventListener('click', close);

  const offLogin = api.on('tg:loginEvent', (ev) => {
    if (ev.type === 'success') { setStatus('Telegram подключён ✓', 'success'); setTimeout(close, 1200); }
    else                       { setStatus('Ошибка: ' + (ev.message || 'unknown'), 'error'); }
  });
  node.addEventListener('remove', offLogin);

  node.querySelector('[data-action="send-code"]').addEventListener('click', async () => {
    const apiId = node.querySelector('[data-field="apiId"]').value.trim();
    const apiHash = node.querySelector('[data-field="apiHash"]').value.trim();
    const phone = node.querySelector('[data-field="phone"]').value.trim();
    if (!apiId || !apiHash || !phone) return toast('Заполните все поля', 'error');
    setStatus('Отправляем код…');
    const res = await api.telegram.startLogin({ apiId: Number(apiId), apiHash, phoneNumber: phone });
    if (!res.ok) return setStatus('Ошибка: ' + res.error, 'error');
    stage('code');
  });

  node.querySelector('[data-action="submit-code"]').addEventListener('click', async () => {
    const code = node.querySelector('[data-field="code"]').value.trim();
    if (!code) return toast('Введите код', 'error');
    setStatus('Проверяем код…');
    const res = await api.telegram.submitCode({ code });
    if (!res.ok) return setStatus('Ошибка: ' + res.error, 'error');
    // After code, GramJS may either succeed or request 2FA password.
    // We listen for the success event; if password is required, the start-flow
    // promise pauses inside our service waiting on password promise. Show 2FA stage:
    setTimeout(() => { if (node.isConnected) stage('password'); }, 800);
  });

  node.querySelector('[data-action="submit-password"]').addEventListener('click', async () => {
    const password = node.querySelector('[data-field="password"]').value;
    if (!password) return toast('Введите пароль', 'error');
    setStatus('Проверяем 2FA…');
    const res = await api.telegram.submitPassword({ password });
    if (!res.ok) return setStatus('Ошибка: ' + res.error, 'error');
  });
}

// ─── VK modal ───────────────────────────────────────────────────
function openVkModal(onClose) {
  const node = tpl('tpl-vk-modal');
  document.body.appendChild(node);
  const close = () => { node.remove(); onClose && onClose(); };

  $$('[data-link]', node).forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); api.openExternal(a.dataset.link); });
  });
  node.querySelector('[data-action="cancel"]').addEventListener('click', close);
  const setStatus = (msg, kind = '') => {
    const el = bind(node, 'status-msg');
    el.className = 'status-msg ' + kind;
    el.textContent = msg;
  };

  node.querySelector('[data-action="save"]').addEventListener('click', async () => {
    const token = node.querySelector('[data-field="token"]').value.trim();
    if (!token) return toast('Вставьте access_token', 'error');
    setStatus('Подключаемся к VK…');
    const res = await api.vk.loginWithToken({ token });
    if (!res.ok) return setStatus('Ошибка: ' + res.error, 'error');
    setStatus('VK подключён ✓', 'success');
    setTimeout(close, 1000);
  });
}
