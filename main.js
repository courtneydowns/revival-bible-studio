const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// Filesystem-safe timestamp for the export folder name, e.g. 2026-06-04_14-30-05.
function timestampSlug() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Revival Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

// PUI2: full-screen popout for any single entry. A second BrowserWindow
// loads popout.html with the workspace + id encoded in the query string —
// independent window state, full edit/rename/delete/archive/restore inside,
// rest of the app stays usable. Opens in Reference Mode by default; the
// popout itself flips into edit mode on a deliberate click.
function createPopoutWindow(workspace, id) {
  const win = new BrowserWindow({
    width: 820,
    height: 720,
    title: 'Revival Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, 'popout.html'), {
    query: { workspace, id: String(id) },
  });
}

function registerIpc() {
  ipcMain.handle('unsorted:list', () => db.listUnsorted());
  ipcMain.handle('unsorted:listArchived', () => db.listArchivedUnsorted());
  ipcMain.handle('unsorted:create', (_event, entry) => db.createUnsorted(entry));
  ipcMain.handle('unsorted:update', (_event, id, entry) => db.updateUnsorted(id, entry));
  ipcMain.handle('unsorted:delete', (_event, id) => db.deleteUnsorted(id));
  ipcMain.handle('unsorted:archive', (_event, id) => db.archiveUnsorted(id));
  ipcMain.handle('unsorted:restore', (_event, id) => db.restoreUnsorted(id));

  ipcMain.handle('sourceMaterial:list', () => db.sourceMaterial.list());
  ipcMain.handle('sourceMaterial:listArchived', () => db.sourceMaterial.listArchived());
  ipcMain.handle('sourceMaterial:create', (_event, entry) => db.sourceMaterial.create(entry));
  ipcMain.handle('sourceMaterial:update', (_event, id, entry) => db.sourceMaterial.update(id, entry));
  ipcMain.handle('sourceMaterial:delete', (_event, id) => db.sourceMaterial.delete(id));
  ipcMain.handle('sourceMaterial:archive', (_event, id) => db.sourceMaterial.archive(id));
  ipcMain.handle('sourceMaterial:restore', (_event, id) => db.sourceMaterial.restore(id));

  ipcMain.handle('documents:list', () => db.documents.list());
  ipcMain.handle('documents:listArchived', () => db.documents.listArchived());
  ipcMain.handle('documents:create', (_event, entry) => db.documents.create(entry));
  ipcMain.handle('documents:update', (_event, id, entry) => db.documents.update(id, entry));
  ipcMain.handle('documents:delete', (_event, id) => db.documents.delete(id));
  ipcMain.handle('documents:archive', (_event, id) => db.documents.archive(id));
  ipcMain.handle('documents:restore', (_event, id) => db.documents.restore(id));

  ipcMain.handle('openQuestions:list', () => db.openQuestions.list());
  ipcMain.handle('openQuestions:listArchived', () => db.openQuestions.listArchived());
  ipcMain.handle('openQuestions:create', (_event, entry) => db.openQuestions.create(entry));
  ipcMain.handle('openQuestions:update', (_event, id, entry) => db.openQuestions.update(id, entry));
  ipcMain.handle('openQuestions:delete', (_event, id) => db.openQuestions.delete(id));
  ipcMain.handle('openQuestions:archive', (_event, id) => db.openQuestions.archive(id));
  ipcMain.handle('openQuestions:restore', (_event, id) => db.openQuestions.restore(id));

  ipcMain.handle('conflicts:list', () => db.conflicts.list());
  ipcMain.handle('conflicts:listArchived', () => db.conflicts.listArchived());
  ipcMain.handle('conflicts:create', (_event, entry) => db.conflicts.create(entry));
  ipcMain.handle('conflicts:update', (_event, id, entry) => db.conflicts.update(id, entry));
  ipcMain.handle('conflicts:delete', (_event, id) => db.conflicts.delete(id));
  ipcMain.handle('conflicts:archive', (_event, id) => db.conflicts.archive(id));
  ipcMain.handle('conflicts:restore', (_event, id) => db.conflicts.restore(id));

  ipcMain.handle('decisions:list', () => db.decisions.list());
  ipcMain.handle('decisions:listArchived', () => db.decisions.listArchived());
  ipcMain.handle('decisions:create', (_event, entry) => db.decisions.create(entry));
  ipcMain.handle('decisions:update', (_event, id, entry) => db.decisions.update(id, entry));
  ipcMain.handle('decisions:delete', (_event, id) => db.decisions.delete(id));
  ipcMain.handle('decisions:archive', (_event, id) => db.decisions.archive(id));
  ipcMain.handle('decisions:restore', (_event, id) => db.decisions.restore(id));

  ipcMain.handle('brainstorm:list', () => db.brainstorm.list());
  ipcMain.handle('brainstorm:listArchived', () => db.brainstorm.listArchived());
  ipcMain.handle('brainstorm:create', (_event, entry) => db.brainstorm.create(entry));
  ipcMain.handle('brainstorm:update', (_event, id, entry) => db.brainstorm.update(id, entry));
  ipcMain.handle('brainstorm:delete', (_event, id) => db.brainstorm.delete(id));
  ipcMain.handle('brainstorm:archive', (_event, id) => db.brainstorm.archive(id));
  ipcMain.handle('brainstorm:restore', (_event, id) => db.brainstorm.restore(id));

  ipcMain.handle('research:list', () => db.research.list());
  ipcMain.handle('research:listArchived', () => db.research.listArchived());
  ipcMain.handle('research:create', (_event, entry) => db.research.create(entry));
  ipcMain.handle('research:update', (_event, id, entry) => db.research.update(id, entry));
  ipcMain.handle('research:delete', (_event, id) => db.research.delete(id));
  ipcMain.handle('research:archive', (_event, id) => db.research.archive(id));
  ipcMain.handle('research:restore', (_event, id) => db.research.restore(id));

  ipcMain.handle('characters:list', () => db.characters.list());
  ipcMain.handle('characters:listArchived', () => db.characters.listArchived());
  ipcMain.handle('characters:create', (_event, entry) => db.characters.create(entry));
  ipcMain.handle('characters:update', (_event, id, entry) => db.characters.update(id, entry));
  ipcMain.handle('characters:delete', (_event, id) => db.characters.delete(id));
  ipcMain.handle('characters:archive', (_event, id) => db.characters.archive(id));
  ipcMain.handle('characters:restore', (_event, id) => db.characters.restore(id));

  ipcMain.handle('episodes:list', () => db.episodes.list());
  ipcMain.handle('episodes:listArchived', () => db.episodes.listArchived());
  ipcMain.handle('episodes:create', (_event, entry) => db.episodes.create(entry));
  ipcMain.handle('episodes:update', (_event, id, entry) => db.episodes.update(id, entry));
  ipcMain.handle('episodes:delete', (_event, id) => db.episodes.delete(id));
  ipcMain.handle('episodes:archive', (_event, id) => db.episodes.archive(id));
  ipcMain.handle('episodes:restore', (_event, id) => db.episodes.restore(id));

  ipcMain.handle('writingLab:list', () => db.writingLab.list());
  ipcMain.handle('writingLab:listArchived', () => db.writingLab.listArchived());
  ipcMain.handle('writingLab:create', (_event, entry) => db.writingLab.create(entry));
  ipcMain.handle('writingLab:update', (_event, id, entry) => db.writingLab.update(id, entry));
  ipcMain.handle('writingLab:delete', (_event, id) => db.writingLab.delete(id));
  ipcMain.handle('writingLab:archive', (_event, id) => db.writingLab.archive(id));
  ipcMain.handle('writingLab:restore', (_event, id) => db.writingLab.restore(id));

  ipcMain.handle('chats:list', () => db.chats.list());
  ipcMain.handle('chats:listArchived', () => db.chats.listArchived());
  ipcMain.handle('chats:create', (_event, chat) => db.chats.create(chat));
  ipcMain.handle('chats:rename', (_event, id, chat) => db.chats.rename(id, chat));
  ipcMain.handle('chats:archive', (_event, id) => db.chats.archive(id));
  ipcMain.handle('chats:restore', (_event, id) => db.chats.restore(id));

  ipcMain.handle('chatSources:list', (_event, chatId) => db.chatSources.list(chatId));
  ipcMain.handle('chatSources:attach', (_event, chatId, sourceId) =>
    db.chatSources.attach(chatId, sourceId)
  );
  ipcMain.handle('chatSources:detach', (_event, chatId, sourceId) =>
    db.chatSources.detach(chatId, sourceId)
  );

  // Panic Export (P21): always saves to a fixed, predictable location —
  // ~/Documents/revival-bible-studio/panic_exports/<timestamp>/ — so the user
  // never has to choose and always knows where to look. Dumps the whole DB +
  // every Source Material entry, then reveals the folder. Copy-only — nothing
  // in the app is mutated.
  ipcMain.handle('panic:export', async () => {
    const folder = path.join(
      app.getPath('documents'),
      'revival-bible-studio',
      'panic_exports',
      `revival-export-${timestampSlug()}`
    );
    fs.mkdirSync(folder, { recursive: true });
    const counts = await db.exportAll(folder);
    shell.openPath(folder);
    return { canceled: false, folder, ...counts };
  });

  // Home dashboard (P27): read-only summary — counts per workspace + a recent
  // activity feed. No mutation.
  ipcMain.handle('dashboard:summary', (_event, limit) =>
    db.dashboard.summary(limit)
  );

  // PHOME: nav badge counts (Unsorted active / Canon Review pending / Open
  // Questions tier-1). Read-only.
  ipcMain.handle('dashboard:navBadges', () => db.dashboard.navBadges());

  // Canon Bible (P31): read-only list + a one-shot dev seed used solely by the
  // P31 smoke test. devSeed is idempotent and visible in the UI — it does NOT
  // bypass Canon Review for real entries; it just primes an empty DB so the
  // read view has something to show. P32+ replaces this with real proposals.
  ipcMain.handle('canon:list', () => db.canon.list());
  ipcMain.handle('canon:listRetired', () => db.canon.listRetired());
  ipcMain.handle('canon:count', () => db.canon.count());
  ipcMain.handle('canon:devSeed', () => db.canon.devSeed());

  // PUI3: Canon Review's only write path for now — accept an extracted
  // snippet and stage it as a pending proposal. The full review UI lands in
  // P35; this just records the proposal so the snippet isn't lost between
  // phases.
  ipcMain.handle('canonProposals:createFromExtract', (_event, payload) =>
    db.canonProposals.createFromExtract(payload)
  );

  // PTAG — tag library + per-entity tag attach/detach. entity_kind is the
  // workspace's DB table name; the renderer passes a constant per workspace.
  ipcMain.handle('tags:listAll', () => db.tags.listAll());
  ipcMain.handle('tags:listFor', (_event, kind, id) => db.tags.listFor(kind, id));
  ipcMain.handle('tags:bulkListFor', (_event, kind, ids) =>
    db.tags.bulkListFor(kind, ids)
  );
  ipcMain.handle('tags:attach', (_event, kind, id, tagId) =>
    db.tags.attach(kind, id, tagId)
  );
  ipcMain.handle('tags:detach', (_event, kind, id, tagId) =>
    db.tags.detach(kind, id, tagId)
  );
  ipcMain.handle('tags:clearFor', (_event, kind, id) =>
    db.tags.clearFor(kind, id)
  );
  ipcMain.handle('tags:create', (_event, payload) => db.tags.create(payload));
  ipcMain.handle('tags:usage', (_event, tagId) => db.tags.usage(tagId));
  ipcMain.handle('tags:remove', (_event, tagId) => db.tags.remove(tagId));
  ipcMain.handle('tags:rename', (_event, tagId, name) =>
    db.tags.rename(tagId, name)
  );

  // PSEARCH — global search across workspaces, canon entries, chats, tags.
  // One read-only IPC; the renderer debounces and passes the term + active
  // filters in a single call.
  ipcMain.handle('search:run', (_event, params) => db.search.run(params));

  // PPASSIVE — linked-entries indicator. Read-only: counts + lists the
  // attachments and canon entries that reference a given workspace entry.
  ipcMain.handle('links:for', (_event, kind, id) => db.links.for(kind, id));

  ipcMain.handle('settings:getProjectRules', () => db.settings.getProjectRules());
  ipcMain.handle('settings:setProjectRules', (_event, text) =>
    db.settings.setProjectRules(text)
  );

  // PUI2 popout wiring.
  //  • popout:open spawns a new BrowserWindow for a single entry.
  //  • popout:changed is a one-way fan-out: whoever just mutated an entry
  //    (popout OR main) tells every OTHER window to refresh its view of that
  //    workspace, so list + detail stay in sync without manual reloads.
  ipcMain.handle('popout:open', (_event, workspace, id) => {
    createPopoutWindow(workspace, id);
  });
  ipcMain.on('popout:changed', (event, workspace) => {
    const fromId = event.sender.id;
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.webContents.id !== fromId) {
        w.webContents.send('popout:changed', workspace);
      }
    }
  });
}

app.whenReady().then(() => {
  const { dbPath, applied } = db.initDatabase(app.getPath('userData'));
  console.log(`[db] ready at ${dbPath} (${applied} migration(s) applied this boot)`);

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
