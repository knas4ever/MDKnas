/// <reference types="vite/client" />

export interface Api {
  fileRead: (path: string) => Promise<string>;
  fileWrite: (path: string, content: string) => Promise<void>;
  fileSaveAs: (content: string) => Promise<string>;
  fileDelete: (path: string) => Promise<void>;
  listFiles: (dir: string) => Promise<{ name: string; isDir: boolean }[]>;
  listThemes: () => Promise<string[]>;
  loadSettings: () => Promise<Settings>;
  saveSettings: (s: Settings) => Promise<void>;
}

export interface Settings {
  theme: 'default' | 'dark' | string;
  fontSize: number;
  wrap: boolean;
}

interface WindowWithApi {
  api: Api;
}

declare global {
  interface Window extends WindowWithApi {}
}
