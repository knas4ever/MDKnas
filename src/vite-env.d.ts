/// <reference types="vite/client" />

export interface Api {
  openFolder: () => Promise<string | null>;
  listFiles: (dir: string) => Promise<unknown[]>;
  readFile: (p: string) => Promise<string>;
  writeFile: (p: string, content: string) => Promise<void>;
  createFile: (p: string, content?: string) => Promise<void>;
  renameFile: (from: string, to: string) => Promise<void>;
  deleteFile: (p: string) => Promise<void>;
  watchDir: (dir: string) => Promise<() => void>;
  onWatch: (cb: (event: string, filename: string) => void) => () => void;
  onOpenFile: (cb: (path: string) => void) => () => void;
  loadSettings: () => Promise<unknown>;
  saveSettings: (s: unknown) => Promise<void>;
  listThemes: () => Promise<string[]>;
  readTheme: (name: string) => Promise<string>;
}

export interface Settings {
  theme: string;
  fontSize: number;
  autosaveMs: number;
}

interface WindowWithApi {
  api: Api;
}

declare global {
  interface Window extends WindowWithApi {}
}
