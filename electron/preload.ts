import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  openFolder: (): Promise<string | null> => ipcRenderer.invoke('files:openFolder'),
  listFiles: (dir: string): Promise<unknown[]> => ipcRenderer.invoke('files:list', dir),
  readFile: (p: string): Promise<string> => ipcRenderer.invoke('files:read', p),
  writeFile: (p: string, content: string): Promise<void> => ipcRenderer.invoke('files:write', p, content),
  createFile: (p: string, content?: string): Promise<void> => ipcRenderer.invoke('files:create', p, content),
  renameFile: (from: string, to: string): Promise<void> => ipcRenderer.invoke('files:rename', from, to),
  deleteFile: (p: string): Promise<void> => ipcRenderer.invoke('files:delete', p),
  watchDir: (dir: string): Promise<void> => ipcRenderer.invoke('files:watch', dir),
  onWatch: (cb: (event: string, filename: string) => void): (() => void) => {
    const listener = (_e: unknown, event: string, filename: string) => cb(event, filename);
    ipcRenderer.on('files:watch-event', listener);
    return () => ipcRenderer.removeListener('files:watch-event', listener);
  },
  onOpenFile: (cb: (path: string) => void): (() => void) => {
    const listener = (_e: unknown, p: string) => cb(p);
    ipcRenderer.on('app:open-file', listener);
    return () => ipcRenderer.removeListener('app:open-file', listener);
  },
  loadSettings: (): Promise<unknown> => ipcRenderer.invoke('settings:load'),
  saveSettings: (s: unknown): Promise<void> => ipcRenderer.invoke('settings:save', s),
  listThemes: (): Promise<string[]> => ipcRenderer.invoke('themes:list'),
  readTheme: (name: string): Promise<string> => ipcRenderer.invoke('themes:read', name)
});
