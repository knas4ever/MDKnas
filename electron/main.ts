import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { registerIpc } from './ipc';

const isDev = process.argv.includes('--dev');
const openIdx = process.argv.indexOf('--open');
const openPath = openIdx !== -1 ? process.argv[openIdx + 1] : null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  win.webContents.on('did-finish-load', () => {
    if (process.argv.includes('--smoke')) {
      app.exit(0);
    }
    if (openPath) {
      win.webContents.send('app:open-file', openPath);
    }
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
