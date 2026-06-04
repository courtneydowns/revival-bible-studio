// Secure bridge between the renderer and the main process.
// Renderer never touches Node/DB directly — only these whitelisted calls.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('revival', {
  unsorted: {
    list: () => ipcRenderer.invoke('unsorted:list'),
    create: (entry) => ipcRenderer.invoke('unsorted:create', entry),
    update: (id, entry) => ipcRenderer.invoke('unsorted:update', id, entry),
    delete: (id) => ipcRenderer.invoke('unsorted:delete', id),
  },
});
