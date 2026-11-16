import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Implements window.api on top of Tauri commands. Under Electron the preload already defines it.
if ((window as any).__TAURI_INTERNALS__ && !(window as any).api) {
  const sub = <T,>(event: string, cb: (p: T) => void): (() => void) => {
    let off: (() => void) | null = null;
    let dead = false;
    listen<T>(event, e => cb(e.payload)).then(u => (dead ? u() : (off = u)));
    return () => {
      dead = true;
      off?.();
    };
  };

  // Startup file/folder are pulled once so they can't be missed by a late listener.
  let pending: Promise<{ file: string | null; folder: string | null }> | null = null;
  const takePending = () => (pending ??= invoke('app_pending'));

  (window as any).api = {
    openFolder: () => invoke('files_open_folder'),
    saveDialog: () => invoke('files_save_dialog'),
    listFiles: (dir: string) => invoke('files_list', { dir }),
    readFile: (path: string) => invoke('files_read', { path }),
    writeFile: (path: string, content: string) => invoke('files_write', { path, content }),
    createFile: (path: string, content?: string) => invoke('files_create', { path, content }),
    renameFile: (from: string, to: string) => invoke('files_rename', { from, to }),
    deleteFile: (path: string) => invoke('files_delete', { path }),
    createFolder: (path: string) => invoke('files_create_folder', { path }),
    openInFileExplorer: (path: string) => invoke('files_open_in_explorer', { path }),
    saveImage: (docDir: string, assetsName: string, fileName: string, data: ArrayBuffer) =>
      invoke('files_save_image', new Uint8Array(data), {
        headers: {
          'x-doc-dir': encodeURIComponent(docDir),
          'x-assets-name': encodeURIComponent(assetsName),
          'x-file-name': encodeURIComponent(fileName)
        }
      }),
    readImageAsDataUrl: (docDir: string, relPath: string) =>
      invoke('files_read_image_data_url', { docDir, relPath }),
    watchDir: async (dir: string) => {
      await invoke('files_watch', { dir });
      return () => {};
    },
    onWatch: (cb: (event: string, filename: string) => void) =>
      sub<[string, string]>('files:watch-event', ([e, f]) => cb(e, f)),
    onOpenFolder: (cb: (dir: string) => void) => {
      takePending().then(p => p.folder && cb(p.folder));
      return sub<string>('app:open-folder', cb);
    },
    onOpenFile: (cb: (path: string) => void) => {
      takePending().then(p => p.file && cb(p.file));
      return sub<string>('app:open-file', cb);
    },
    onMenu: (cb: (action: string) => void) => sub<string>('app:menu', cb),
    openExternal: (url: string) => void invoke('app_open_external', { url }),
    setSourceMenuState: (checked: boolean) => void invoke('app_source_state', { checked }),
    loadSettings: () => invoke('settings_load'),
    saveSettings: (settings: unknown) => invoke('settings_save', { settings }),
    listThemes: () => invoke('themes_list'),
    readTheme: (name: string) => invoke('themes_read', { name }),
    getAbout: () => invoke('app_about')
  };
}
