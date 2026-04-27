<div align="center">

<img src="OmniDeskIcon.svg" width="128" alt="OmniDesk"/>

# OmniDesk

**Десктоп-агрегатор Telegram + ВКонтакте со встроенной мини-CRM и заметками**

[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d4?logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Telegram](https://img.shields.io/badge/Telegram-MTProto-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/mtproto)
[![VK](https://img.shields.io/badge/VK-API_5.199-4680C2?logo=vk&logoColor=white)](https://dev.vk.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)
[![Made with love](https://img.shields.io/badge/made%20with-♥-red)](#)

Один автономный `.exe` · ставите → вводите ключи → работаете

</div>

---

## ✨ Возможности

| Группа | Что внутри |
|---|---|
| 💬 **Единый инбокс** | Диалоги Telegram и ВКонтакте в одной ленте, отправка/приём в реальном времени, бейджи источников |
| 👥 **Мини-CRM** | Карточки клиентов, статусы (Новый · В работе · Закрыт · Отказ), цветные теги |
| 📝 **Заметки** | Текстовые заметки на клиента или диалог, мгновенный поиск |
| 🌐 **Прокси Telegram** | Поддержка **MTProxy** и **SOCKS5** — корректная работа TG в РФ |
| 🔔 **Win-уведомления** | Нативные toast-уведомления Windows, иконка в системном трее |
| 🔐 **Безопасное хранилище** | Все токены и сессии шифруются через **Windows DPAPI** (`safeStorage`) |
| 🗄 **Локальная БД** | SQLite (WAL) в `%APPDATA%\OmniDesk\database.sqlite` — никаких облаков |
| 📦 **Один установщик** | `.exe` устанавливается как обычная Windows-программа |

---

## 🚀 Установка для пользователя

1. Скачайте **`OmniDesk Setup 1.0.0.exe`** из [Releases](#).
2. Запустите — мастер установит OmniDesk в Program Files и создаст ярлыки.
3. При первом запуске откроется **онбординг из 3 шагов**:

```
   ┌─ Шаг 1 · 🌐 Прокси для Telegram (опционально, для РФ)
   ├─ Шаг 2 · ✈️ Telegram (api_id + api_hash + телефон + код)
   └─ Шаг 3 · 🌀 ВКонтакте (access_token)
```

4. Жмите **«Перейти в OmniDesk»** — все диалоги подтянутся в инбокс.
5. На следующих запусках — никаких повторных вводов: ключи зашифрованы и подгружаются автоматически.

---

## 🔑 Как получить ключи

### Telegram

1. Откройте **https://my.telegram.org/apps** → войдите по номеру телефона.
2. Нажмите **Create new application** → получите `api_id` и `api_hash`.
3. В OmniDesk вставьте их + укажите свой номер.
4. Код подтверждения придёт **в Telegram-чат «Telegram»** (не SMS).
5. Если включена 2FA — введите облачный пароль.

### ВКонтакте

1. Откройте **https://vkhost.github.io/** → выберите *Kate Mobile* или *VK Admin*.
2. Авторизуйтесь, скопируйте `access_token` из URL (часть после `access_token=`).
3. Вставьте токен в OmniDesk.

> **Права токена**: достаточно `messages,offline`. Не давайте лишние scope — OmniDesk работает только с сообщениями.

### Прокси Telegram (если TG заблокирован у провайдера)

OmniDesk поддерживает два типа прокси:

| Тип | Параметры | Где взять |
|---|---|---|
| **MTProxy** | host, port, secret (ee/dd…) | публичные списки MTProxy / собственный сервер |
| **SOCKS5** | host, port, login (опц.), pass (опц.) | любой SOCKS5-провайдер |

Прокси настраивается в **Настройках → Прокси Telegram**. Применяется при следующем подключении TG.

---

## 🏗 Архитектура

```
omnidesk/
├── package.json
├── electron-builder.yml         # NSIS-установщик OmniDesk Setup.exe
├── build/
│   ├── icon.ico                 # multi-res 16/32/48/64/128/256
│   ├── icon.png                 # 512×512
│   └── tray.png
├── src/
│   ├── main/                    # ─── Main process (Node.js) ───
│   │   ├── main.js              # entry: lifecycle, single-instance lock
│   │   ├── preload.js           # contextBridge → window.omnidesk
│   │   ├── ipc.js               # все ipcMain.handle
│   │   ├── windows/
│   │   │   ├── mainWindow.js    # BrowserWindow, hide-to-tray
│   │   │   └── tray.js          # System Tray + меню
│   │   ├── db/
│   │   │   ├── database.js      # better-sqlite3 (WAL)
│   │   │   ├── migrations.js
│   │   │   └── repositories/    # clients, chats, messages, notes, tags
│   │   ├── services/
│   │   │   ├── telegramService.js   # GramJS + MTProxy/SOCKS5
│   │   │   ├── vkService.js         # vk-io LongPoll
│   │   │   ├── credentialsManager.js # safeStorage (DPAPI)
│   │   │   ├── notificationService.js
│   │   │   └── inboxAggregator.js
│   │   └── utils/{paths,logger}.js
│   └── renderer/                # ─── Renderer (Vanilla JS) ───
│       ├── index.html           # шаблоны для всех экранов
│       ├── styles/              # tokens, layout, components, animations
│       └── scripts/
│           ├── app.js
│           ├── modules/         # onboarding, inbox, crm, notes, settings
│           └── ui/              # dom utils, toast
└── scripts/
    ├── build-icon.js            # SVG → .ico (sharp + png-to-ico)
    └── fetch-prebuilds.js       # better-sqlite3 prebuilt for Electron
```

### Поток данных

```
  Renderer (Vanilla JS)
       │  window.omnidesk.<channel>(args)
       ▼
  preload.js  ── contextBridge ──▶ ipcRenderer.invoke
                                          │
                                          ▼
                                   ipcMain.handle (ipc.js)
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
           db/repositories/*     services/telegramService    services/vkService
                                  └─ MTProxy / SOCKS5 ─┘    └─ LongPoll ─┘
                                          │                       │
                                          └────── events ─────────┘
                                                  │
                                          inboxAggregator
                                                  │
                                  ┌───────────────┴───────────────┐
                                  ▼                               ▼
                   chatsRepo.upsert + messagesRepo.add    notificationService
                                                                  │
                                          mainWindow.send('inbox:newMessage')
```

### Где хранятся данные

```
%APPDATA%\OmniDesk\
├── database.sqlite              ← вся CRM, чаты, заметки
├── sessions/
│   ├── telegram.config          ← api_id + api_hash       (DPAPI)
│   ├── telegram.session         ← MTProto-сессия GramJS   (DPAPI)
│   ├── vk.token                 ← access_token            (DPAPI)
│   └── proxy.config             ← конфиг прокси           (DPAPI)
└── logs/
    └── omnidesk-YYYY-MM-DD.log
```

---

## 🛠 Стек

| Слой | Технология |
|---|---|
| Оболочка | **Electron 31** · BrowserWindow · contextIsolation |
| UI | Vanilla JS / HTML / CSS · ES Modules · CSS-переменные · бенто-сетка |
| База данных | **better-sqlite3** (WAL, prebuilt для Electron) |
| Telegram | **GramJS** (pure JS MTProto, без TDLib-нативки) |
| ВКонтакте | **vk-io** (LongPoll) |
| Шифрование | **Electron `safeStorage`** → Windows DPAPI |
| Сборка | **electron-builder** → NSIS · `.exe` ~82 МБ |
| Иконка | **Sharp** + **png-to-ico** (SVG → multi-res ICO) |

---

## 👨‍💻 Разработка / сборка из исходников

### Требования
- Windows 10 / 11 (x64)
- Node.js ≥ 18 (рекомендуется 20+)
- Git

### Установка

```bash
git clone https://github.com/<your-org>/OmniDesk.git
cd OmniDesk
npm install --ignore-scripts
node scripts/fetch-prebuilds.js     # подтягивает better-sqlite3 для Electron
node node_modules/electron/install.js  # скачивает electron.exe
npm run build:icon                  # SVG → build/icon.ico
```

### Запуск в режиме разработки

```bash
npm start
```

### Сборка установщика

```bash
npm run dist
# → dist/OmniDesk Setup 1.0.0.exe
```

### Альтернатива: portable-exe (без установки)

```bash
npm run dist:portable
```

> **Важно**: `npmRebuild: false` в `electron-builder.yml` — мы используем prebuilt-бинарник `better-sqlite3` для Electron, чтобы не требовать MSVC Build Tools на машине разработчика.

---

## 🔐 Безопасность

- **Никаких хардкоженных ключей** — все секреты вводятся пользователем в UI и шифруются.
- **`contextIsolation: true`** + **`nodeIntegration: false`** — Renderer не имеет прямого доступа к Node API.
- **`safeStorage`** использует Windows DPAPI: расшифровка возможна только под учётной записью того же пользователя на том же ПК.
- **CSP** в `index.html`: `default-src 'self'`, `script-src 'self'` — никаких внешних скриптов.
- **`shell.openExternal`** для всех внешних ссылок — открывает в системном браузере, а не в Electron.

---

## 📋 Roadmap

- [ ] Поиск по архивированным сообщениям
- [ ] Шаблоны быстрых ответов
- [ ] Экспорт CRM в CSV / XLSX
- [ ] WhatsApp Business / Avito / Instagram DM
- [ ] Тёмная / светлая темы (сейчас — premium dark)
- [ ] Мультиаккаунты в одном TG / VK слоте
- [ ] Auto-update через `electron-updater`

---

## 🤝 Контрибьютинг

PR приветствуются. Открывайте issue с описанием бага или фичи. Для крупных изменений сначала обсудите дизайн в issue.

```bash
# fork → clone → branch
git checkout -b feature/awesome
# код
npm start
# тесты, линт
git commit -m "feat: awesome thing"
git push origin feature/awesome
# Pull Request → main
```

---

## 📄 Лицензия

[MIT](LICENSE) © 2026 OmniDesk

---

<div align="center">

**Сделано на Electron + ♥ для Windows**

[Сайт](#) · [Telegram-канал](#) · [Issues](#)

</div>
