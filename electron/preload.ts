import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  openFolder: (): Promise<string | null> => ipcRenderer.invoke('files:openFolder'),
  saveDialog: (): Promise<string | null> => ipcRenderer.invoke('files:saveDialog'),
  listFiles: (dir: string): Promise<unknown[]> => ipcRenderer.invoke('files:list', dir),
  readFile: (p: string): Promise<string> => ipcRenderer.invoke('files:read', p),
  writeFile: (p: string, content: string): Promise<void> => ipcRenderer.invoke('files:write', p, content),
  createFile: (p: string, content?: string): Promise<void> => ipcRenderer.invoke('files:create', p, content),
  renameFile: (from: string, to: string): Promise<void> => ipcRenderer.invoke('files:rename', from, to),
  deleteFile: (p: string): Promise<void> => ipcRenderer.invoke('files:delete', p),
  saveImage: (docDir: string, assetsName: string, fileName: string, data: ArrayBuffer): Promise<string | null> =>
    ipcRenderer.invoke('files:saveImage', { docDir, assetsName, fileName, data: new Uint8Array(data) }),
  readImageAsDataUrl: (docDir: string, relPath: string): Promise<string | null> =>
    ipcRenderer.invoke('files:readImageAsDataUrl', docDir, relPath),
  watchDir: (dir: string): Promise<() => void> => ipcRenderer.invoke('files:watch', dir),
  onWatch: (cb: (event: string, filename: string) => void): (() => void) => {
    const listener = (_e: unknown, event: string, filename: string) => cb(event, filename);
    ipcRenderer.on('files:watch-event', listener);
    return () => ipcRenderer.removeListener('files:watch-event', listener);
  },
  onOpenFolder: (cb: (dir: string) => void): (() => void) => {
    const listener = (_e: unknown, dir: string) => cb(dir);
    ipcRenderer.on('app:open-folder', listener);
    return () => ipcRenderer.removeListener('app:open-folder', listener);
  },
  onOpenFile: (cb: (path: string) => void): (() => void) => {
    const listener = (_e: unknown, p: string) => cb(p);
    ipcRenderer.on('app:open-file', listener);
    return () => ipcRenderer.removeListener('app:open-file', listener);
  },
  onMenu: (cb: (action: string) => void): (() => void) => {
    const listener = (_e: unknown, action: string) => cb(action);
    ipcRenderer.on('app:menu', listener);
    return () => ipcRenderer.removeListener('app:menu', listener);
  },
  openExternal: (url: string): void => {
    ipcRenderer.invoke('app:openExternal', url);
  },
  setSourceMenuState: (checked: boolean): void => {
    ipcRenderer.send('app:source-state', checked);
  },
  loadSettings: (): Promise<unknown> => ipcRenderer.invoke('settings:load'),
  saveSettings: (s: unknown): Promise<void> => ipcRenderer.invoke('settings:save', s),
  listThemes: (): Promise<string[]> => ipcRenderer.invoke('themes:list'),
  readTheme: (name: string): Promise<string> => ipcRenderer.invoke('themes:read', name)
});
