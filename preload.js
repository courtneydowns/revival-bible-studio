// Secure bridge between the renderer and the main process.
// Renderer never touches Node/DB directly — only these whitelisted calls.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('revival', {
  unsorted: {
    list: () => ipcRenderer.invoke('unsorted:list'),
    listArchived: () => ipcRenderer.invoke('unsorted:listArchived'),
    create: (entry) => ipcRenderer.invoke('unsorted:create', entry),
    update: (id, entry) => ipcRenderer.invoke('unsorted:update', id, entry),
    delete: (id) => ipcRenderer.invoke('unsorted:delete', id),
    archive: (id) => ipcRenderer.invoke('unsorted:archive', id),
    restore: (id) => ipcRenderer.invoke('unsorted:restore', id),
  },
  sourceMaterial: {
    list: () => ipcRenderer.invoke('sourceMaterial:list'),
    listArchived: () => ipcRenderer.invoke('sourceMaterial:listArchived'),
    create: (entry) => ipcRenderer.invoke('sourceMaterial:create', entry),
    update: (id, entry) => ipcRenderer.invoke('sourceMaterial:update', id, entry),
    delete: (id) => ipcRenderer.invoke('sourceMaterial:delete', id),
    archive: (id) => ipcRenderer.invoke('sourceMaterial:archive', id),
    restore: (id) => ipcRenderer.invoke('sourceMaterial:restore', id),
  },
  documents: {
    list: () => ipcRenderer.invoke('documents:list'),
    listArchived: () => ipcRenderer.invoke('documents:listArchived'),
    create: (entry) => ipcRenderer.invoke('documents:create', entry),
    update: (id, entry) => ipcRenderer.invoke('documents:update', id, entry),
    delete: (id) => ipcRenderer.invoke('documents:delete', id),
    archive: (id) => ipcRenderer.invoke('documents:archive', id),
    restore: (id) => ipcRenderer.invoke('documents:restore', id),
  },
  openQuestions: {
    list: () => ipcRenderer.invoke('openQuestions:list'),
    listArchived: () => ipcRenderer.invoke('openQuestions:listArchived'),
    create: (entry) => ipcRenderer.invoke('openQuestions:create', entry),
    update: (id, entry) => ipcRenderer.invoke('openQuestions:update', id, entry),
    delete: (id) => ipcRenderer.invoke('openQuestions:delete', id),
    archive: (id) => ipcRenderer.invoke('openQuestions:archive', id),
    restore: (id) => ipcRenderer.invoke('openQuestions:restore', id),
  },
  conflicts: {
    list: () => ipcRenderer.invoke('conflicts:list'),
    listArchived: () => ipcRenderer.invoke('conflicts:listArchived'),
    create: (entry) => ipcRenderer.invoke('conflicts:create', entry),
    update: (id, entry) => ipcRenderer.invoke('conflicts:update', id, entry),
    delete: (id) => ipcRenderer.invoke('conflicts:delete', id),
    archive: (id) => ipcRenderer.invoke('conflicts:archive', id),
    restore: (id) => ipcRenderer.invoke('conflicts:restore', id),
  },
  decisions: {
    list: () => ipcRenderer.invoke('decisions:list'),
    listArchived: () => ipcRenderer.invoke('decisions:listArchived'),
    create: (entry) => ipcRenderer.invoke('decisions:create', entry),
    update: (id, entry) => ipcRenderer.invoke('decisions:update', id, entry),
    delete: (id) => ipcRenderer.invoke('decisions:delete', id),
    archive: (id) => ipcRenderer.invoke('decisions:archive', id),
    restore: (id) => ipcRenderer.invoke('decisions:restore', id),
  },
  brainstorm: {
    list: () => ipcRenderer.invoke('brainstorm:list'),
    listArchived: () => ipcRenderer.invoke('brainstorm:listArchived'),
    create: (entry) => ipcRenderer.invoke('brainstorm:create', entry),
    update: (id, entry) => ipcRenderer.invoke('brainstorm:update', id, entry),
    delete: (id) => ipcRenderer.invoke('brainstorm:delete', id),
    archive: (id) => ipcRenderer.invoke('brainstorm:archive', id),
    restore: (id) => ipcRenderer.invoke('brainstorm:restore', id),
  },
  research: {
    list: () => ipcRenderer.invoke('research:list'),
    listArchived: () => ipcRenderer.invoke('research:listArchived'),
    create: (entry) => ipcRenderer.invoke('research:create', entry),
    update: (id, entry) => ipcRenderer.invoke('research:update', id, entry),
    delete: (id) => ipcRenderer.invoke('research:delete', id),
    archive: (id) => ipcRenderer.invoke('research:archive', id),
    restore: (id) => ipcRenderer.invoke('research:restore', id),
  },
  chats: {
    list: () => ipcRenderer.invoke('chats:list'),
    listArchived: () => ipcRenderer.invoke('chats:listArchived'),
    create: (chat) => ipcRenderer.invoke('chats:create', chat),
    rename: (id, chat) => ipcRenderer.invoke('chats:rename', id, chat),
    archive: (id) => ipcRenderer.invoke('chats:archive', id),
    restore: (id) => ipcRenderer.invoke('chats:restore', id),
  },
  chatSources: {
    list: (chatId) => ipcRenderer.invoke('chatSources:list', chatId),
    attach: (chatId, sourceId) =>
      ipcRenderer.invoke('chatSources:attach', chatId, sourceId),
    detach: (chatId, sourceId) =>
      ipcRenderer.invoke('chatSources:detach', chatId, sourceId),
  },
  dashboard: {
    summary: (limit) => ipcRenderer.invoke('dashboard:summary', limit),
  },
  settings: {
    getProjectRules: () => ipcRenderer.invoke('settings:getProjectRules'),
    setProjectRules: (text) =>
      ipcRenderer.invoke('settings:setProjectRules', text),
  },
  panic: {
    export: () => ipcRenderer.invoke('panic:export'),
  },
});
