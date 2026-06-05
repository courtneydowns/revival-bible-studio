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

  ipcMain.handle('settings:getProjectRules', () => db.settings.getProjectRules());
  ipcMain.handle('settings:setProjectRules', (_event, text) =>
    db.settings.setProjectRules(text)
  );
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
