import { app, dialog, ipcMain, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import * as files from './fileService';
import * as settings from './settingsService';

export function registerIpc(): void {
  ipcMain.handle('files:openFolder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle('files:saveDialog', async () => {
    const res = await dialog.showSaveDialog({
      defaultPath: 'untitled.md',
      filters: [{ name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] }]
    });
    return res.canceled ? null : res.filePath;
  });
  ipcMain.handle('files:list', (_e, dir: string) => files.listFiles(dir));
  ipcMain.handle('files:read', (_e, p: string) => files.readFile(p));
  ipcMain.handle('files:write', (_e, p: string, content: string) => {
    files.writeFile(p, content);
  });
  ipcMain.handle('files:create', (_e, p: string, content?: string) => {
    files.createFile(p, content ?? '');
  });
  ipcMain.handle('files:rename', (_e, from: string, to: string) => {
    files.renameFile(from, to);
  });
  ipcMain.handle('files:delete', (_e, p: string) => {
    files.deleteFile(p);
  });
  ipcMain.handle('files:watch', (_e, dir: string) => {
    files.watchDir(dir, (event, filename) => {
      // ipcMain.emit does not reach the sandboxed renderer reliably;
      // webContents.send does (same path as 'app:open-file').
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send('files:watch-event', event, filename);
    });
  });
  // Save a dropped image into the document's assets folder (e.g. <doc>_assets/)
  // and return the path relative to the document's folder.
  ipcMain.handle('files:saveImage', (_e, args: { docDir: string; assetsName: string; fileName: string; data: Uint8Array }) => {
    try {
      const { docDir, assetsName, fileName, data } = args;
      if (!docDir || !assetsName) return null;
      const assetsDir = path.join(path.resolve(docDir), assetsName);
      fs.mkdirSync(assetsDir, { recursive: true });
      const safe = path.basename(fileName).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'image';
      const dot = safe.lastIndexOf('.');
      const stem = dot > 0 ? safe.slice(0, dot) : safe;
      const ext = dot > 0 ? safe.slice(dot) : '';
      let target = path.join(assetsDir, safe);
      let n = 1;
      while (fs.existsSync(target)) {
        target = path.join(assetsDir, `${stem}-${n}${ext}`);
        n += 1;
      }
      fs.writeFileSync(target, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
      return `${assetsName}/${path.basename(target)}`;
    } catch {
      return null;
    }
  });

  // Read an image referenced by the document and return it as a data URL.
  // (Chromium in Electron refuses <img> loads of file:// sub-resources, so
  // the renderer cannot fetch local images directly.)
  ipcMain.handle('files:readImageAsDataUrl', (_e, docDir: string, relPath: string) => {
    try {
      if (!docDir || !relPath) return null;
      const root = path.resolve(docDir);
      const abs = path.resolve(root, relPath);
      if (abs !== root && !abs.startsWith(root + path.sep)) return null;
      const stat = fs.statSync(abs);
      if (!stat.isFile()) return null;
      const mime: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
      };
      const ext = path.extname(abs).toLowerCase();
      const type = mime[ext] ?? 'application/octet-stream';
      return `data:${type};base64,${fs.readFileSync(abs).toString('base64')}`;
    } catch {
      return null;
    }
  });
  const userData = (): string => app.getPath('userData');
  const themesDir = (): string => path.join(userData(), 'themes');
  ipcMain.handle('settings:load', () => settings.loadSettings(userData()));
  ipcMain.handle('settings:save', (_e, s: settings.Settings) => {
    settings.saveSettings(userData(), s);
  });
  ipcMain.handle('themes:list', () => {
    try {
      return fs
        .readdirSync(themesDir())
        .filter(f => f.endsWith('.css'))
        .map(f => f.replace(/\.css$/, ''));
    } catch {
      return [];
    }
  });
  ipcMain.handle('themes:read', (_e, name: string) => {
    return fs.readFileSync(path.join(themesDir(), `${name}.css`), 'utf-8');
  });
}
