const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('omnidesk', {
  // ── App / status ──────────────────────────────────────────────
  status:        () => invoke('app:status'),
  openExternal:  (url) => invoke('app:openExternal', url),

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
    sendMessage: (data) => invoke('inbox:sendMessage', data)
  },

  // ── Chats / messages ──────────────────────────────────────────
  chats: {
    list:         () => invoke('chats:list'),
    markRead:     (data) => invoke('chats:markRead', data),
    togglePin:    (data) => invoke('chats:togglePin', data),
    syncDialogs:  () => invoke('chats:syncDialogs'),
    attachClient: (data) => invoke('chats:attachClient', data)
  },
  messages: {
    list: (data) => invoke('messages:list', data)
  },

  // ── CRM ───────────────────────────────────────────────────────
  clients: {
    list:   (filter) => invoke('clients:list', filter),
    get:    (data) => invoke('clients:get', data),
    create: (data) => invoke('clients:create', data),
    update: (data) => invoke('clients:update', data),
    remove: (data) => invoke('clients:remove', data)
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

  // ── Subscriptions to push events from main ────────────────────
  on: (channel, handler) => {
    const allowed = new Set([
      'inbox:newMessage',
      'tg:status', 'vk:status',
      'tg:loginEvent'
    ]);
    if (!allowed.has(channel)) return () => {};
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
