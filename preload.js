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
    escalateTier: (id) => ipcRenderer.invoke('openQuestions:escalateTier', id),
    setBlocking: (id, opts) => ipcRenderer.invoke('openQuestions:setBlocking', id, opts),
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
    createFromQuestion: (questionId, entry) => ipcRenderer.invoke('decisions:createFromQuestion', questionId, entry),
  },
  brainstorm: {
    list: () => ipcRenderer.invoke('brainstorm:list'),
    listArchived: () => ipcRenderer.invoke('brainstorm:listArchived'),
    create: (entry) => ipcRenderer.invoke('brainstorm:create', entry),
    update: (id, entry) => ipcRenderer.invoke('brainstorm:update', id, entry),
    delete: (id) => ipcRenderer.invoke('brainstorm:delete', id),
    archive: (id) => ipcRenderer.invoke('brainstorm:archive', id),
    restore: (id) => ipcRenderer.invoke('brainstorm:restore', id),
    // PBRAIN-STRUCT — threads
    threads: {
      list: () => ipcRenderer.invoke('brainstorm:threads.list'),
      listArchived: () => ipcRenderer.invoke('brainstorm:threads.listArchived'),
      create: (title) => ipcRenderer.invoke('brainstorm:threads.create', title),
      update: (id, title) => ipcRenderer.invoke('brainstorm:threads.update', id, title),
      archive: (id) => ipcRenderer.invoke('brainstorm:threads.archive', id),
      restore: (id) => ipcRenderer.invoke('brainstorm:threads.restore', id),
      delete: (id) => ipcRenderer.invoke('brainstorm:threads.delete', id),
    },
    // PBRAIN-STRUCT — item metadata
    setThread: (id, threadId) => ipcRenderer.invoke('brainstorm:setThread', id, threadId),
    setDevInto: (id, kind, targetId) => ipcRenderer.invoke('brainstorm:setDevInto', id, kind, targetId),
    setStatus: (id, status) => ipcRenderer.invoke('brainstorm:setStatus', id, status),
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
    setStatus: (id, status) => ipcRenderer.invoke('characters:setStatus', id, status),
  },
  // P37 — directed typed edges between characters (workspace-level)
  characterRelationships: {
    listAll: () => ipcRenderer.invoke('characterRelationships:listAll'),
    listForChar: (charId) =>
      ipcRenderer.invoke('characterRelationships:listForChar', charId),
    create: (fromId, toId, relType, note) =>
      ipcRenderer.invoke('characterRelationships:create', fromId, toId, relType, note),
    update: (id, relType, note) =>
      ipcRenderer.invoke('characterRelationships:update', id, relType, note),
    delete: (id) => ipcRenderer.invoke('characterRelationships:delete', id),
  },
  episodes: {
    list: () => ipcRenderer.invoke('episodes:list'),
    listArchived: () => ipcRenderer.invoke('episodes:listArchived'),
    create: (entry) => ipcRenderer.invoke('episodes:create', entry),
    update: (id, entry) => ipcRenderer.invoke('episodes:update', id, entry),
    delete: (id) => ipcRenderer.invoke('episodes:delete', id),
    archive: (id) => ipcRenderer.invoke('episodes:archive', id),
    restore: (id) => ipcRenderer.invoke('episodes:restore', id),
    setStatus: (id, status) => ipcRenderer.invoke('episodes:setStatus', id, status),
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
    listWithMeta: () => ipcRenderer.invoke('chats:listWithMeta'),
    listArchivedWithMeta: () => ipcRenderer.invoke('chats:listArchivedWithMeta'),
    create: (chat) => ipcRenderer.invoke('chats:create', chat),
    rename: (id, chat) => ipcRenderer.invoke('chats:rename', id, chat),
    archive: (id) => ipcRenderer.invoke('chats:archive', id),
    restore: (id) => ipcRenderer.invoke('chats:restore', id),
    delete: (id) => ipcRenderer.invoke('chats:delete', id),
  },
  chatSources: {
    list: (chatId) => ipcRenderer.invoke('chatSources:list', chatId),
    attach: (chatId, sourceId) =>
      ipcRenderer.invoke('chatSources:attach', chatId, sourceId),
    detach: (chatId, sourceId) =>
      ipcRenderer.invoke('chatSources:detach', chatId, sourceId),
  },
  chatDocuments: {
    list: (chatId) => ipcRenderer.invoke('chatDocuments:list', chatId),
    attach: (chatId, documentId) =>
      ipcRenderer.invoke('chatDocuments:attach', chatId, documentId),
    detach: (chatId, documentId) =>
      ipcRenderer.invoke('chatDocuments:detach', chatId, documentId),
  },
  chatCanon: {
    list: (chatId) => ipcRenderer.invoke('chatCanon:list', chatId),
    attach: (chatId, canonEntryId) =>
      ipcRenderer.invoke('chatCanon:attach', chatId, canonEntryId),
    detach: (chatId, canonEntryId) =>
      ipcRenderer.invoke('chatCanon:detach', chatId, canonEntryId),
  },
  chatCharacters: {
    list: (chatId) => ipcRenderer.invoke('chatCharacters:list', chatId),
    attach: (chatId, characterId) =>
      ipcRenderer.invoke('chatCharacters:attach', chatId, characterId),
    detach: (chatId, characterId) =>
      ipcRenderer.invoke('chatCharacters:detach', chatId, characterId),
  },
  chatEpisodes: {
    list: (chatId) => ipcRenderer.invoke('chatEpisodes:list', chatId),
    attach: (chatId, episodeId) =>
      ipcRenderer.invoke('chatEpisodes:attach', chatId, episodeId),
    detach: (chatId, episodeId) =>
      ipcRenderer.invoke('chatEpisodes:detach', chatId, episodeId),
  },
  // P40 — persisted chat message history
  chatMessages: {
    list: (chatId) => ipcRenderer.invoke('chatMessages:list', chatId),
    add: (chatId, role, content) =>
      ipcRenderer.invoke('chatMessages:add', chatId, role, content),
    archive: (id) => ipcRenderer.invoke('chatMessages:archive', id),
    unarchive: (id) => ipcRenderer.invoke('chatMessages:unarchive', id),
  },
  // P40 — Claude API (call lives in main so the key never touches the renderer)
  claude: {
    send: (messages, systemPrompt, model, chatId) =>
      ipcRenderer.invoke('claude:send', messages, systemPrompt, model, chatId),
    // P42 — natural-language search over approved canon entries.
    canonSearch: (query, model) =>
      ipcRenderer.invoke('claude:canonSearch', query, model),
    // P43 — on-demand conflict check: proposal vs locked canon entries.
    conflictCheck: (proposalId, model) =>
      ipcRenderer.invoke('claude:conflictCheck', proposalId, model),
    // PAI-WIRE — cross-AI conflict check on raw text (P42→P43, P45→P43).
    conflictCheckText: (payload, model) =>
      ipcRenderer.invoke('claude:conflictCheckText', payload, model),
    // P44 — Writing Lab draft assistant.
    draftAssist: (draftTitle, draftBody, sources, messages, model) =>
      ipcRenderer.invoke('claude:draftAssist', draftTitle, draftBody, sources, messages, model),
    // P45 — AI import assistant: type suggestions + duplicate flags.
    importAssist: (entries, model) =>
      ipcRenderer.invoke('claude:importAssist', entries, model),
    // P46-A — Flanagan Filter: craft analysis for Open Questions entries.
    flanaganFilter: (payload, model) =>
      ipcRenderer.invoke('claude:flanaganFilter', payload, model),
    flanaganTagSuggest: (analysisData, tags, model) =>
      ipcRenderer.invoke('claude:flanaganTagSuggest', analysisData, tags, model),
  },
  // P46-B / PFLAN-EXPAND — Flanagan Filter analyses, keyed by entity kind + id.
  flanaganAnalyses: {
    create: (entityKind, entityId, data) =>
      ipcRenderer.invoke('flanaganAnalyses:create', entityKind, entityId, data),
    list: (entityKind, entityId) =>
      ipcRenderer.invoke('flanaganAnalyses:list', entityKind, entityId),
    markStale: (id) => ipcRenderer.invoke('flanaganAnalyses:markStale', id),
    delete: (id) => ipcRenderer.invoke('flanaganAnalyses:delete', id),
  },
  dashboard: {
    summary: (limit) => ipcRenderer.invoke('dashboard:summary', limit),
    navBadges: () => ipcRenderer.invoke('dashboard:navBadges'),
    needsAttention: (thresholds) => ipcRenderer.invoke('dashboard:needsAttention', thresholds),
  },
  canon: {
    list: () => ipcRenderer.invoke('canon:list'),
    listRetired: () => ipcRenderer.invoke('canon:listRetired'),
    count: () => ipcRenderer.invoke('canon:count'),
    devSeed: () => ipcRenderer.invoke('canon:devSeed'),
    // P32 — direct create/edit/archive/delete on canon entries. typeConfig
    // returns the field schema for all 18 entry types so the renderer builds
    // forms without duplicating column lists.
    typeConfig: () => ipcRenderer.invoke('canon:typeConfig'),
    getDetail: (id) => ipcRenderer.invoke('canon:getDetail', id),
    create: (payload) => ipcRenderer.invoke('canon:create', payload),
    update: (id, payload) => ipcRenderer.invoke('canon:update', id, payload),
    delete: (id) => ipcRenderer.invoke('canon:delete', id),
    archive: (id) => ipcRenderer.invoke('canon:archive', id),
    restore: (id) => ipcRenderer.invoke('canon:restore', id),
    // P33 — lock/unlock toggle. payload = { locked: bool, locked_label?: string }.
    setLocked: (id, payload) =>
      ipcRenderer.invoke('canon:setLocked', id, payload),
    // P34 — supersede: creates a new active entry from this one, retires the
    // original, and wires the chain pointers in both directions. payload is
    // the same shape as canon.update() — overrides only.
    supersede: (id, payload) =>
      ipcRenderer.invoke('canon:supersede', id, payload),
    // PHIST — return the full supersede chain (oldest → newest) for any entry
    // in it. Each item is a full getDetail() record so the renderer can diff
    // versions field by field without a second round trip.
    versionChain: (id) => ipcRenderer.invoke('canon:versionChain', id),
    // PEXPORT — Canon Bible readable export. params = { filterBy, filterId }.
    // filterBy: 'all' | 'entry_type' | 'character' | 'season'.
    // filterId: entry_type string or canon_entries.id.
    export: (params) => ipcRenderer.invoke('canon:export', params),
  },
  // PCONFLICT — on-demand conflict scan + route. scan() is read-only and
  // returns { scannedAt, totalActiveEntries, conflicts: [...] }; each
  // conflict is { kind, label, detail, entries: [...] }. routeToConflicts()
  // writes one row to the Conflicts workspace summarizing the flagged group.
  canonConflicts: {
    scan: () => ipcRenderer.invoke('canonConflicts:scan'),
    routeToConflicts: (payload) =>
      ipcRenderer.invoke('canonConflicts:routeToConflicts', payload),
    // PCONFLICT-2 (auto-route) — scan + auto-route + auto-archive in one
    // call. Returns the scan result plus routedNew[]/alreadyTracked[].
    scanAndRoute: () => ipcRenderer.invoke('canonConflicts:scanAndRoute'),
    // PCONFLICT-2 — canon entry ids referenced by any open conflict flag;
    // used by Canon Bible to fire a one-shot toast on mutations to those
    // entries reminding the user to re-run detection on the Conflicts page.
    openFlagEntryIds: () => ipcRenderer.invoke('canonConflicts:openFlagEntryIds'),
  },
  // PUI3 + P35: extract-and-route stages snippets; the queue surface reads/
  // edits the JSON payload and resolves each proposal via approve/sendBack/
  // defer/reject/delete. list returns pending+sent_back+deferred (the
  // actionable queue); approved/rejected are out of scope for the UI.
  canonProposals: {
    createFromAI: (payload) => ipcRenderer.invoke('canonProposals:createFromAI', payload),
    createFromExtract: (payload) =>
      ipcRenderer.invoke('canonProposals:createFromExtract', payload),
    list: () => ipcRenderer.invoke('canonProposals:list'),
    getById: (id) => ipcRenderer.invoke('canonProposals:getById', id),
    updateFields: (id, payload) =>
      ipcRenderer.invoke('canonProposals:updateFields', id, payload),
    approve: (id, payload) =>
      ipcRenderer.invoke('canonProposals:approve', id, payload),
    sendBack: (id, payload) =>
      ipcRenderer.invoke('canonProposals:sendBack', id, payload),
    defer: (id, payload) =>
      ipcRenderer.invoke('canonProposals:defer', id, payload),
    reject: (id, payload) =>
      ipcRenderer.invoke('canonProposals:reject', id, payload),
    delete: (id) => ipcRenderer.invoke('canonProposals:delete', id),
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
    // P39 — Claude API key
    getClaudeApiKey: () => ipcRenderer.invoke('settings:getClaudeApiKey'),
    setClaudeApiKey: (key) => ipcRenderer.invoke('settings:setClaudeApiKey', key),
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
  // P36 — cross-workspace attachment writes and picker data.
  crossWorkspace: {
    attach: (hostKind, hostId, sourceKind, sourceId) =>
      ipcRenderer.invoke('crossWorkspace:attach', hostKind, hostId, sourceKind, sourceId),
    detach: (hostKind, hostId, sourceKind, sourceId) =>
      ipcRenderer.invoke('crossWorkspace:detach', hostKind, hostId, sourceKind, sourceId),
    candidates: (sourceKind) =>
      ipcRenderer.invoke('crossWorkspace:candidates', sourceKind),
  },
  // PImp1 — worldbuilding file import. pickFile opens the OS dialog and reads
  // the chosen file; checkConflicts compares proposed titles to live canon;
  // stageEntries writes proposals to the Canon Review queue.
  import: {
    pickFile: () => ipcRenderer.invoke('import:pickFile'),
    checkConflicts: (proposals) => ipcRenderer.invoke('import:checkConflicts', proposals),
    stageEntries: (entries, fileName) =>
      ipcRenderer.invoke('import:stageEntries', entries, fileName),
  },
  panic: {
    export: () => ipcRenderer.invoke('panic:export'),
  },
  // PSESSION-LOG — audit trail. finalize() saves the current session and
  // starts a fresh one; list() returns all past logs; export(id) writes a
  // plain-text file and reveals the folder.
  sessionLog: {
    finalize: () => ipcRenderer.invoke('sessionLog:finalize'),
    list:     () => ipcRenderer.invoke('sessionLog:list'),
    export:   (id) => ipcRenderer.invoke('sessionLog:export', id),
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
