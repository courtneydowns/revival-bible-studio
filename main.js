const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db');

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
  ipcMain.handle('unsorted:create', (_event, entry) => db.createUnsorted(entry));
  ipcMain.handle('unsorted:update', (_event, id, entry) => db.updateUnsorted(id, entry));
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
