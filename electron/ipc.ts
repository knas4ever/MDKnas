import { app, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import * as files from './fileService';
import * as settings from './settingsService';

export function registerIpc(): void {
  ipcMain.handle('files:openFolder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
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
      ipcMain.emit('files:watch-event', event, filename);
    });
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
