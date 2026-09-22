export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export interface Settings {
  theme: string;
  fontSize: number;
  autosaveMs: number;
  lastFolder?: string | null;
}

export interface EditorApi {
  openFolder(): Promise<string | null>;
  saveDialog(): Promise<string | null>;
  listFiles(dir: string): Promise<FileNode[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string, content?: string): Promise<void>;
  renameFile(from: string, to: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  saveImage(docDir: string, assetsName: string, fileName: string, data: ArrayBuffer): Promise<string | null>;
  readImageAsDataUrl(docDir: string, relPath: string): Promise<string | null>;
  watchDir(dir: string): Promise<() => void>;
  onWatch(cb: (event: string, filename: string) => void): () => void;
  onOpenFolder(cb: (dir: string) => void): () => void;
  onOpenFile(cb: (path: string) => void): () => void;
  openExternal(url: string): void;
  onMenu(cb: (action: string) => void): () => void;
  setSourceMenuState(checked: boolean): void;
  loadSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  listThemes(): Promise<string[]>;
  readTheme(name: string): Promise<string>;
}

declare global {
  interface Window {
    api: EditorApi;
  }
}
