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
});
