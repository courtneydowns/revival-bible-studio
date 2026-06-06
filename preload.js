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
  characters: {
    list: () => ipcRenderer.invoke('characters:list'),
    listArchived: () => ipcRenderer.invoke('characters:listArchived'),
    create: (entry) => ipcRenderer.invoke('characters:create', entry),
    update: (id, entry) => ipcRenderer.invoke('characters:update', id, entry),
    delete: (id) => ipcRenderer.invoke('characters:delete', id),
    archive: (id) => ipcRenderer.invoke('characters:archive', id),
    restore: (id) => ipcRenderer.invoke('characters:restore', id),
  },
  episodes: {
    list: () => ipcRenderer.invoke('episodes:list'),
    listArchived: () => ipcRenderer.invoke('episodes:listArchived'),
    create: (entry) => ipcRenderer.invoke('episodes:create', entry),
    update: (id, entry) => ipcRenderer.invoke('episodes:update', id, entry),
    delete: (id) => ipcRenderer.invoke('episodes:delete', id),
    archive: (id) => ipcRenderer.invoke('episodes:archive', id),
    restore: (id) => ipcRenderer.invoke('episodes:restore', id),
  },
  writingLab: {
    list: () => ipcRenderer.invoke('writingLab:list'),
    listArchived: () => ipcRenderer.invoke('writingLab:listArchived'),
    create: (entry) => ipcRenderer.invoke('writingLab:create', entry),
    update: (id, entry) => ipcRenderer.invoke('writingLab:update', id, entry),
    delete: (id) => ipcRenderer.invoke('writingLab:delete', id),
    archive: (id) => ipcRenderer.invoke('writingLab:archive', id),
    restore: (id) => ipcRenderer.invoke('writingLab:restore', id),
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
    navBadges: () => ipcRenderer.invoke('dashboard:navBadges'),
  },
  canon: {
    list: () => ipcRenderer.invoke('canon:list'),
    listRetired: () => ipcRenderer.invoke('canon:listRetired'),
    count: () => ipcRenderer.invoke('canon:count'),
    devSeed: () => ipcRenderer.invoke('canon:devSeed'),
  },
  // PUI3: extract-and-route lands new Canon Review proposals here. Full
  // review queue UI comes in P35; this is the staging write only.
  canonProposals: {
    createFromExtract: (payload) =>
      ipcRenderer.invoke('canonProposals:createFromExtract', payload),
  },
  // PTAG — tag library + per-entity attach/detach. entity_kind = the DB
  // table name (e.g. 'unsorted', 'canon_entries').
  tags: {
    listAll: () => ipcRenderer.invoke('tags:listAll'),
    listFor: (kind, id) => ipcRenderer.invoke('tags:listFor', kind, id),
    bulkListFor: (kind, ids) => ipcRenderer.invoke('tags:bulkListFor', kind, ids),
    attach: (kind, id, tagId) =>
      ipcRenderer.invoke('tags:attach', kind, id, tagId),
    detach: (kind, id, tagId) =>
      ipcRenderer.invoke('tags:detach', kind, id, tagId),
    clearFor: (kind, id) => ipcRenderer.invoke('tags:clearFor', kind, id),
    create: (payload) => ipcRenderer.invoke('tags:create', payload),
    usage: (tagId) => ipcRenderer.invoke('tags:usage', tagId),
    remove: (tagId) => ipcRenderer.invoke('tags:remove', tagId),
    rename: (tagId, name) => ipcRenderer.invoke('tags:rename', tagId, name),
  },
  settings: {
    getProjectRules: () => ipcRenderer.invoke('settings:getProjectRules'),
    setProjectRules: (text) =>
      ipcRenderer.invoke('settings:setProjectRules', text),
  },
  // PSEARCH — read-only global search. Renderer passes { q, workspace,
  // tagId, entryType, canonStatus, lockStatus }; main returns groups by source.
  search: {
    run: (params) => ipcRenderer.invoke('search:run', params),
  },
  // PPASSIVE — read-only linked-entries indicator. kind = entityKind (DB
  // logical name), id = row id. Returns { attachments, canonLinks, counts }.
  links: {
    for: (kind, id) => ipcRenderer.invoke('links:for', kind, id),
  },
  panic: {
    export: () => ipcRenderer.invoke('panic:export'),
  },
  // PUI2: open a single-entry popout window, and a tiny pub-sub so popout
  // saves are reflected in the main window (and vice-versa). notifyChanged is
  // fire-and-forget; onChanged returns the unsubscribe handle so a workspace
  // can drop its listener when it unmounts.
  popout: {
    open: (workspace, id) => ipcRenderer.invoke('popout:open', workspace, id),
    notifyChanged: (workspace) => ipcRenderer.send('popout:changed', workspace),
    onChanged: (callback) => {
      const handler = (_event, workspace) => callback(workspace);
      ipcRenderer.on('popout:changed', handler);
      return () => ipcRenderer.removeListener('popout:changed', handler);
    },
  },
});
