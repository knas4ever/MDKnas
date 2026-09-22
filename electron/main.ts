import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { registerIpc } from './ipc';
import type { MenuItem, MenuItemConstructorOptions } from 'electron';

ipcMain.handle('app:openExternal', (_event, url: string) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    void shell.openExternal(url);
  }
});

const isDev = process.argv.includes('--dev');
const openIdx = process.argv.indexOf('--open');
const openPath = openIdx !== -1 ? process.argv[openIdx + 1] : null;
const openFolderIdx = process.argv.indexOf('--open-folder');
const openFolderDir = openFolderIdx !== -1 ? process.argv[openFolderIdx + 1] : null;

function findMenuItem(items: MenuItem[], label: string): MenuItem | null {
  for (const item of items) {
    if (item.label === label) return item;
    if (item.submenu) {
      const hit = findMenuItem(item.submenu.items, label);
      if (hit) return hit;
    }
  }
  return null;
}

function buildMenu(win: BrowserWindow): void {
  const send = (action: string): void => win.webContents.send('app:menu', action);
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const res = await dialog.showOpenDialog(win, {
              filters: [{ name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] }]
            });
            const p = res.canceled ? null : res.filePaths[0];
            if (p) win.webContents.send('app:open-file', p);
          }
        },
        { label: 'Open Folder…', click: () => send('openFolder') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Format',
      submenu: [
        { label: 'Bold', accelerator: 'CmdOrCtrl+B', click: () => send('fmt:bold') },
        { label: 'Italic', accelerator: 'CmdOrCtrl+I', click: () => send('fmt:italic') },
        { label: 'Strikethrough', accelerator: 'CmdOrCtrl+Shift+X', click: () => send('fmt:strikethrough') },
        { label: 'Underline', accelerator: 'CmdOrCtrl+U', click: () => send('fmt:underline') },
        { label: 'Highlight', accelerator: 'CmdOrCtrl+Shift+H', click: () => send('fmt:highlight') },
        { label: 'Inline Code', accelerator: 'CmdOrCtrl+`', click: () => send('fmt:code') },
        { type: 'separator' },
        { label: 'Heading 1', accelerator: 'CmdOrCtrl+1', click: () => send('fmt:h1') },
        { label: 'Heading 2', accelerator: 'CmdOrCtrl+2', click: () => send('fmt:h2') },
        { label: 'Heading 3', accelerator: 'CmdOrCtrl+3', click: () => send('fmt:h3') },
        { type: 'separator' },
        { label: 'Bullet List', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('fmt:ul') },
        { label: 'Task List', accelerator: 'CmdOrCtrl+Shift+T', click: () => send('fmt:tasklist') },
        { label: 'Numbered List', accelerator: 'CmdOrCtrl+Shift+7', click: () => send('fmt:ol') },
        { label: 'Quote', accelerator: 'CmdOrCtrl+Shift+Q', click: () => send('fmt:quote') },
        { type: 'separator' },
        { label: 'Link…', accelerator: 'CmdOrCtrl+K', click: () => send('fmt:link') },
        { label: 'Code Block', click: () => send('fmt:codeblock') },
        { label: 'Table…', click: () => send('fmt:table') }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Raw Markdown Source',
          type: 'checkbox',
          checked: false,
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => send('source')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  const sourceItem = findMenuItem(menu.items, 'Raw Markdown Source');
  ipcMain.on('app:source-state', (_e: Electron.IpcMainEvent, checked: boolean) => {
    if (sourceItem) sourceItem.checked = checked;
  });
}

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
  buildMenu(win);
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
    if (openFolderDir) {
      win.webContents.send('app:open-folder', openFolderDir);
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
