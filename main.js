const { app, BrowserWindow } = require('electron');
const path = require('path');
const { initDatabase } = require('./db');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Revival Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  const { dbPath, applied } = initDatabase(app.getPath('userData'));
  console.log(`[db] ready at ${dbPath} (${applied} migration(s) applied this boot)`);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
