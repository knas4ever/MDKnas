import { contextBridge, ipcRenderer } from 'electron';
import type { Api, Settings } from '../src/vite-env';

contextBridge.exposeInMainWorld('api', {
  fileRead: (path: string) => ipcRenderer.invoke('file:read', path),
  fileWrite: (path: string, content: string) => ipcRenderer.invoke('file:write', { path, content }),
  fileSaveAs: (content: string) => ipcRenderer.invoke('file:saveAs', content),
  fileDelete: (path: string) => ipcRenderer.invoke('file:delete', path),
  listFiles: (dir: string) => ipcRenderer.invoke('file:list', dir),
  listThemes: () => ipcRenderer.invoke('theme:list'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s: Settings) => ipcRenderer.invoke('settings:save', s)
});
