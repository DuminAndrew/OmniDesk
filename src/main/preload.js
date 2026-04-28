const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('omnidesk', {
  // ── App / status ──────────────────────────────────────────────
  status:        () => invoke('app:status'),
  openExternal:  (url) => invoke('app:openExternal', url),
  copy:          (text) => invoke('app:copy', text),
  openTelegramOrg: () => invoke('app:openTelegramOrg'),

  // ── Proxy ─────────────────────────────────────────────────────
  proxy: {
    get:   () => invoke('proxy:get'),
    save:  (cfg) => invoke('proxy:save', cfg),
    clear: () => invoke('proxy:clear')
  },

  // ── Telegram ──────────────────────────────────────────────────
  telegram: {
    startLogin:     (data) => invoke('tg:startLogin', data),
    submitCode:     (data) => invoke('tg:submitCode', data),
    submitPassword: (data) => invoke('tg:submitPassword', data),
    logout:         () => invoke('tg:logout'),
    listDialogs:    () => invoke('tg:listDialogs'),
    sendMessage:    (data) => invoke('tg:sendMessage', data)
  },

  // ── VK ────────────────────────────────────────────────────────
  vk: {
    loginWithToken: (data) => invoke('vk:loginWithToken', data),
    logout:         () => invoke('vk:logout'),
    listDialogs:    () => invoke('vk:listDialogs'),
    sendMessage:    (data) => invoke('vk:sendMessage', data)
  },

  // ── Unified inbox ─────────────────────────────────────────────
  inbox: {
    sendMessage:      (data) => invoke('inbox:sendMessage', data),
    pickFile:         () => invoke('inbox:pickFile'),
    sendFile:         (data) => invoke('inbox:sendFile', data),
    savePastedImage:  (data) => invoke('inbox:savePastedImage', data)
  },

  // ── Chats / messages ──────────────────────────────────────────
  chats: {
    list:         (filter) => invoke('chats:list', filter),
    markRead:     (data) => invoke('chats:markRead', data),
    togglePin:    (data) => invoke('chats:togglePin', data),
    syncDialogs:  () => invoke('chats:syncDialogs'),
    attachClient: (data) => invoke('chats:attachClient', data)
  },
  messages: {
    list: (data) => invoke('messages:list', data),
    loadHistory: (data) => invoke('messages:loadHistory', data)
  },

  media: {
    download: (data) => invoke('media:download', data),
    saveAs:   (data) => invoke('media:saveAs', data)
  },

  // ── CRM ───────────────────────────────────────────────────────
  clients: {
    list:           (filter) => invoke('clients:list', filter),
    get:            (data) => invoke('clients:get', data),
    create:         (data) => invoke('clients:create', data),
    update:         (data) => invoke('clients:update', data),
    remove:         (data) => invoke('clients:remove', data),
    listChats:      (data) => invoke('clients:listChats', data),
    createFromChat: (data) => invoke('clients:createFromChat', data)
  },

  // ── Notes ─────────────────────────────────────────────────────
  notes: {
    listForClient: (data) => invoke('notes:listForClient', data),
    listForChat:   (data) => invoke('notes:listForChat', data),
    create:        (data) => invoke('notes:create', data),
    update:        (data) => invoke('notes:update', data),
    remove:        (data) => invoke('notes:remove', data)
  },

  // ── Tags ──────────────────────────────────────────────────────
  tags: {
    list:          () => invoke('tags:list'),
    create:        (data) => invoke('tags:create', data),
    remove:        (data) => invoke('tags:remove', data),
    attach:        (data) => invoke('tags:attach', data),
    detach:        (data) => invoke('tags:detach', data),
    listForClient: (data) => invoke('tags:listForClient', data)
  },

  // ── Tasks ─────────────────────────────────────────────────────
  tasks: {
    list:           (filter) => invoke('tasks:list', filter),
    get:            (data) => invoke('tasks:get', data),
    create:         (data) => invoke('tasks:create', data),
    update:         (data) => invoke('tasks:update', data),
    toggleComplete: (data) => invoke('tasks:toggleComplete', data),
    remove:         (data) => invoke('tasks:remove', data),
    counts:         () => invoke('tasks:counts')
  },

  // ── Whisper / voice transcription ─────────────────────────────
  whisper: {
    status:        () => invoke('whisper:status'),
    downloadModel: () => invoke('whisper:downloadModel'),
    transcribe:    (data) => invoke('whisper:transcribe', data),
    saveTranscript:(data) => invoke('whisper:saveTranscript', data)
  },

  // ── Link previews ─────────────────────────────────────────────
  link: {
    preview: (url) => invoke('link:preview', { url })
  },

  // ── OTA updater ───────────────────────────────────────────────
  updater: {
    state:   () => invoke('updater:state'),
    check:   () => invoke('updater:check'),
    install: () => invoke('updater:install')
  },

  // ── Subscriptions to push events from main ────────────────────
  on: (channel, handler) => {
    const allowed = new Set([
      'inbox:newMessage',
      'inbox:avatarReady',
      'tg:status', 'vk:status',
      'tg:loginEvent',
      'whisper:progress',
      'updater:state'
    ]);
    if (!allowed.has(channel)) return () => {};
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
