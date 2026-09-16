# Electron WYSIWYG Markdown Editor — From-Scratch Rebuild Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Typora-like WYSIWYG Markdown editor from scratch as an Electron + React/TypeScript desktop app, per `docs/superpowers/specs/2026-09-16-electron-wysiwyg-markdown-editor-design.md`.

**Architecture:** Electron main process (Node) owns all file IO via IPC; the renderer keeps the raw Markdown string as the single source of truth. Every keystroke edits the raw string, re-renders it through markdown-it + custom renderers into a `contenteditable` surface, and restores the cursor via `data-s`/`data-e` source-offset attributes.

**Tech Stack:** Electron, React 18, TypeScript, Vite, Tailwind v3, markdown-it, KaTeX, Mermaid, highlight.js, esbuild (main process), Vitest (unit/integration, jsdom), Playwright (E2E), electron-builder.

## Global Constraints

- Node >= 20; TypeScript strict mode; no `any` in production code (test mocks may cast).
- No system packages may be installed; Electron uses prebuilt binaries only.
- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; all Node access through `window.api` from preload.
- Cursor model: source offsets are character indexes into the raw Markdown string. Rendered text runs are wrapped in `<span data-s="<start>" data-e="<end>">`; blocks carry `data-bi="<blockIndex>"`.
- Error fallbacks: cursor-restore failure -> cursor at end; mermaid render failure -> raw text stays visible in the block; write failure -> status bar shows `unsaved`.
- One conventional-commit per task (`feat:`, `chore:`, `test:`, `build:`).
- Test commands: `npx vitest run` (unit/integration), `npm run e2e` (build + Playwright), `npx tsc --noEmit` (types).

---

### Task 1: Cleanup and project scaffold

**Files:**
- Delete: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tauri.conf.json`, `src/`, `src-tauri/`, `node_modules/`
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `electron/main.ts`, `electron/preload.ts`

**Interfaces:**
- Produces: a bootable Electron shell loading a React placeholder; scripts `build:electron`, `build:renderer`, `dev`, `test`, `e2e`, `dist`; `window.api` surface (all methods, wired to IPC in Task 3).

- [ ] **Step 1: Delete old build files**

```bash
git rm -r src src-tauri package.json tsconfig.json vite.config.ts tailwind.config.js postcss.config.js tauri.conf.json
rm -rf node_modules package-lock.json
```

Expected: index and worktree no longer contain the old Tauri/React files; `docs/` untouched.

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "md-editor",
  "private": true,
  "version": "1.0.0",
  "main": "electron/dist/main.js",
  "scripts": {
    "build:electron": "esbuild electron/main.ts electron/preload.ts --bundle --platform=node --external:electron --out-dir=electron/dist --format=cjs",
    "build:renderer": "tsc --noEmit && vite build",
    "build": "npm run build:electron && npm run build:renderer",
    "dev": "concurrently -k \"vite\" \"npm:dev:electron\"",
    "dev:electron": "wait-on tcp:127.0.0.1:5173 && npm run build:electron && electron .",
    "test": "vitest run",
    "e2e": "npm run build && playwright test",
    "dist": "npm run build && electron-builder"
  },
  "dependencies": {
    "highlight.js": "^11.10.0",
    "katex": "^0.16.11",
    "markdown-it": "^14.1.0",
    "mermaid": "^10.9.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.5",
    "@types/markdown-it": "^14.1.2",
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "concurrently": "^9.1.0",
    "electron": "^33.2.0",
    "electron-builder": "^25.1.8",
    "esbuild": "^0.24.0",
    "jsdom": "^25.0.1",
    "playwright": "^1.49.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4",
    "wait-on": "^8.0.1"
  }
}
```

- [ ] **Step 3: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "electron", "tests", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist' }
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}']
  }
});
```

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60000
});
```

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: []
};
```

`postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

`.gitignore`:
```
node_modules/
dist/
electron/dist/
dist_electron/
*.log
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MD Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Write renderer entry and placeholder app**

`src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
```

`src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="h-screen flex items-center justify-center text-lg">
      MD Editor — scaffold
    </div>
  );
}
```

`src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Write Electron main and preload**

`electron/main.ts`:
```ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

const isDev = process.argv.includes('--dev');

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
  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
  win.webContents.on('did-finish-load', () => {
    if (process.argv.includes('--smoke')) {
      app.exit(0);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

`electron/preload.ts` (full `window.api` surface; IPC handlers land in Task 3):
```ts
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
```

- [ ] **Step 6: Install and verify the scaffold**

```bash
npm install
npx tsc --noEmit            # expected: no errors
npm run build:electron      # expected: electron/dist/main.js + electron/dist/preload.js
npx vite build              # expected: dist/index.html
npx electron . --smoke      # expected: process exits 0 (window loads placeholder)
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts tailwind.config.js postcss.config.js index.html src electron
git commit -m "chore: scaffold Electron + React project from scratch"
```

---

### Task 2: File and settings services (main-process modules)

**Files:**
- Create: `electron/fileService.ts`, `electron/settingsService.ts`
- Test: `tests/integration/fileService.test.ts`, `tests/integration/settingsService.test.ts`

**Interfaces:**
- Consumes: Node `fs`, `path` only (no Electron imports, so Vitest can run them).
- Produces: `FileNode`, `listFiles(dir)`, `readFile(p)`, `writeFile(p, c)`, `createFile(p, c?)`, `renameFile(from, to)`, `deleteFile(p)`, `watchDir(dir, cb) -> stop()`, `Settings`, `DEFAULT_SETTINGS`, `loadSettings(dir)`, `saveSettings(dir, s)`.

- [ ] **Step 1: Write failing tests**

`tests/integration/fileService.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listFiles, readFile, writeFile, createFile, renameFile, deleteFile } from '../../electron/fileService';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('fileService', () => {
  it('lists a tree with directories first, sorted', () => {
    fs.mkdirSync(path.join(dir, 'b'));
    fs.mkdirSync(path.join(dir, 'a'));
    fs.writeFileSync(path.join(dir, 'z.md'), 'hi');
    fs.writeFileSync(path.join(dir, 'a', 'x.md'), 'x');
    const tree = listFiles(dir);
    expect(tree.map(n => n.name)).toEqual(['a', 'b', 'z.md']);
    expect(tree[0].children?.map(n => n.name)).toEqual(['x.md']);
  });

  it('ignores .git and node_modules', () => {
    fs.mkdirSync(path.join(dir, '.git'));
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'f.md'), 'f');
    expect(listFiles(dir).map(n => n.name)).toEqual(['f.md']);
  });

  it('round-trips utf-8 content', () => {
    writeFile(path.join(dir, 'f.md'), 'héllo **w**');
    expect(readFile(path.join(dir, 'f.md'))).toBe('héllo **w**');
  });

  it('creates, renames, deletes files', () => {
    const p = path.join(dir, 'new.md');
    createFile(p, 'a');
    renameFile(p, path.join(dir, 'renamed.md'));
    expect(readFile(path.join(dir, 'renamed.md'))).toBe('a');
    deleteFile(path.join(dir, 'renamed.md'));
    expect(fs.existsSync(path.join(dir, 'renamed.md'))).toBe(false);
  });
});
```

`tests/integration/settingsService.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../electron/settingsService';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('settingsService', () => {
  it('returns defaults when no file exists', () => {
    expect(loadSettings(dir)).toEqual(DEFAULT_SETTINGS);
  });

  it('saves and loads settings', () => {
    const s = { ...DEFAULT_SETTINGS, theme: 'dark' };
    saveSettings(dir, s);
    expect(loadSettings(dir)).toEqual(s);
  });

  it('merges a partial saved file with defaults', () => {
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: 'dark' }));
    expect(loadSettings(dir)).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration`
Expected: FAIL — `fileService` / `settingsService` do not exist.

- [ ] **Step 3: Write the implementations**

`electron/fileService.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store']);
const MAX_DEPTH = 5;

export function listFiles(dir: string): FileNode[] {
  function walk(d: string, depth: number): FileNode[] {
    return fs
      .readdirSync(d, { withFileTypes: true })
      .filter(e => !IGNORED.has(e.name))
      .sort((a, b) =>
        a.isDirectory() === b.isDirectory()
          ? a.name.localeCompare(b.name)
          : a.isDirectory()
            ? -1
            : 1
      )
      .map(e => {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          return {
            name: e.name,
            path: full,
            isDir: true,
            children: depth < MAX_DEPTH ? walk(full, depth + 1) : []
          };
        }
        return { name: e.name, path: full, isDir: false };
      });
  }
  return walk(dir, 0);
}

export function readFile(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

export function writeFile(p: string, content: string): void {
  fs.writeFileSync(p, content, 'utf-8');
}

export function createFile(p: string, content = ''): void {
  fs.writeFileSync(p, content, 'utf-8');
}

export function renameFile(from: string, to: string): void {
  fs.renameSync(from, to);
}

export function deleteFile(p: string): void {
  fs.rmSync(p, { recursive: true });
}

export function watchDir(
  dir: string,
  cb: (event: string, filename: string) => void
): () => void {
  let timer: NodeJS.Timeout | null = null;
  const watcher = fs.watch(dir, { recursive: true, persistent: false }, (eventType, filename) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => cb(eventType, filename ?? ''), 100);
  });
  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}
```

`electron/settingsService.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';

export interface Settings {
  theme: string;
  fontSize: number;
  autosaveMs: number;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'light', fontSize: 16, autosaveMs: 1000 };

export function loadSettings(dir: string): Settings {
  try {
    const raw = fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8');
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(dir: string, settings: Settings): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/fileService.ts electron/settingsService.ts tests/integration
git commit -m "feat: add file and settings services"
```

---

### Task 3: IPC registration and main-process wiring

**Files:**
- Create: `electron/ipc.ts`
- Modify: `electron/main.ts` (register IPC, `--open` flag)
- Test: covered by the smoke check (no unit test possible for `ipcMain` outside Electron)

**Interfaces:**
- Consumes: `fileService`, `settingsService`, Electron `ipcMain`/`dialog`/`app`.
- Produces: IPC channels `files:*`, `settings:*`, `themes:*`, `app:open-file` matching the preload surface from Task 1.

- [ ] **Step 1: Write `electron/ipc.ts`**

```ts
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
```

- [ ] **Step 2: Wire it in `electron/main.ts`**

Replace the `did-finish-load` handler and `whenReady` block:

```ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { registerIpc } from './ipc';

const isDev = process.argv.includes('--dev');
const openIdx = process.argv.indexOf('--open');
const openPath = openIdx !== -1 ? process.argv[openIdx + 1] : null;

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
  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
  win.webContents.on('did-finish-load', () => {
    if (process.argv.includes('--smoke')) {
      app.exit(0);
    }
    if (openPath) {
      win.webContents.send('app:open-file', openPath);
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
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run build:electron
npx electron . --smoke
```
Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc.ts electron/main.ts
git commit -m "feat: wire IPC handlers and file-open flag"
```

---

### Task 4: Editor actions (pure string operations)

**Files:**
- Create: `src/lib/editorActions.ts`
- Test: `tests/unit/editorActions.test.ts`

**Interfaces:**
- Produces: `Selection { start, end }`, `EditorAction`, `insertText`, `backspace`, `deleteForward`, `autoPairInsert`, `wrapSelection`, `toggleHeading`, `toggleList`, `toggleBlockquote`, `indent`, `handleEnter`, `applyAction` — all `(content, selection, ...) -> { content, selection }`.

- [ ] **Step 1: Write failing tests**

`tests/unit/editorActions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  insertText,
  backspace,
  deleteForward,
  autoPairInsert,
  wrapSelection,
  toggleHeading,
  toggleList,
  toggleBlockquote,
  indent,
  handleEnter,
  applyAction,
  type Selection
} from '../../src/lib/editorActions';

const S = (start: number, end: number): Selection => ({ start, end });

describe('insertText', () => {
  it('replaces selection and moves cursor', () => {
    const r = insertText('hello', S(1, 3), 'X');
    expect(r.content).toBe('hXlo');
    expect(r.selection).toEqual(S(2, 2));
  });
});

describe('backspace', () => {
  it('deletes selection', () => {
    expect(backspace('hello', S(1, 3))).toEqual({ content: 'hlo', selection: S(1, 1) });
  });
  it('deletes char before cursor', () => {
    expect(backspace('hello', S(3, 3))).toEqual({ content: 'helo', selection: S(2, 2) });
  });
});

describe('deleteForward', () => {
  it('deletes char at cursor', () => {
    expect(deleteForward('hello', S(2, 2))).toEqual({ content: 'helo', selection: S(2, 2) });
  });
});

describe('autoPairInsert', () => {
  it('wraps paired char with closing pair', () => {
    const r = autoPairInsert('ab', S(1, 1), '(');
    expect(r.content).toBe('a()b');
    expect(r.selection).toEqual(S(2, 2));
  });
  it('skips existing closing char', () => {
    const r = autoPairInsert('a)', S(1, 1), '(');
    expect(r.content).toBe('a)');
    expect(r.selection).toEqual(S(2, 2));
  });
  it('passes through unpaired text', () => {
    expect(autoPairInsert('ab', S(1, 1), 'x')).toEqual({ content: 'axb', selection: S(2, 2) });
  });
});

describe('wrapSelection', () => {
  it('wraps selection', () => {
    const r = wrapSelection('hello', S(1, 4), '**', '**');
    expect(r.content).toBe('h**ell**o');
    expect(r.selection).toEqual(S(3, 6));
  });
  it('unwraps when markers surround selection', () => {
    const r = wrapSelection('h**ell**o', S(3, 6), '**', '**');
    expect(r.content).toBe('hello');
    expect(r.selection).toEqual(S(1, 4));
  });
  it('wraps plain selection with strikethrough', () => {
    expect(wrapSelection('hello', S(1, 4), '~~', '~~').content).toBe('h~~ell~~o');
  });
});

describe('toggleHeading', () => {
  it('adds heading', () => {
    expect(toggleHeading('hello', S(1, 1), 2).content).toBe('## hello');
  });
  it('removes heading of same level', () => {
    expect(toggleHeading('## hello', S(3, 3), 2).content).toBe('hello');
  });
  it('changes level', () => {
    expect(toggleHeading('## hello', S(3, 3), 1).content).toBe('# hello');
  });
});

describe('toggleList', () => {
  it('adds bullet', () => {
    expect(toggleList('hello', S(1, 1), false).content).toBe('- hello');
  });
  it('removes bullet', () => {
    expect(toggleList('- hello', S(2, 2), false).content).toBe('hello');
  });
  it('adds ordered', () => {
    expect(toggleList('hello', S(1, 1), true).content).toBe('1. hello');
  });
});

describe('toggleBlockquote', () => {
  it('toggles', () => {
    expect(toggleBlockquote('hi', S(1, 1)).content).toBe('> hi');
    expect(toggleBlockquote('> hi', S(3, 3)).content).toBe('hi');
  });
});

describe('indent', () => {
  it('indents and outdents', () => {
    const a = indent('- a', S(1, 1), false);
    expect(a.content).toBe('  - a');
    expect(indent(a.content, S(3, 3), true).content).toBe('- a');
  });
});

describe('handleEnter', () => {
  it('continues list', () => {
    const r = handleEnter('- a', S(3, 3));
    expect(r.content).toBe('- a\n- ');
    expect(r.selection).toEqual(S(6, 6));
  });
  it('exits empty list item', () => {
    expect(handleEnter('- \n', S(2, 2)).content).toBe('\n');
  });
  it('continues blockquote', () => {
    expect(handleEnter('> a', S(3, 3)).content).toBe('> a\n> ');
  });
  it('plain newline', () => {
    expect(handleEnter('ab', S(2, 2)).content).toBe('ab\n');
  });
});

describe('applyAction', () => {
  it('bold wraps', () => {
    expect(applyAction('hello', S(1, 4), 'bold').content).toBe('h**ell**o');
  });
  it('link wraps', () => {
    expect(applyAction('text', S(0, 4), 'link').content).toBe('[text](url)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/editorActions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/editorActions.ts`:
```ts
export interface Selection {
  start: number;
  end: number;
}

export type EditorAction =
  | 'bold'
  | 'italic'
  | 'code'
  | 'link'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'quote';

const PAIR_MAP: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '*': '*',
  '`': '`'
};

export function getLine(content: string, pos: number): { start: number; end: number; text: string } {
  const start = content.lastIndexOf('\n', pos - 1) + 1;
  let end = content.indexOf('\n', pos);
  if (end === -1) end = content.length;
  return { start, end, text: content.slice(start, end) };
}

export function insertText(
  content: string,
  sel: Selection,
  text: string
): { content: string; selection: Selection } {
  const next = content.slice(0, sel.start) + text + content.slice(sel.end);
  return { content: next, selection: { start: sel.start + text.length, end: sel.start + text.length } };
}

export function backspace(content: string, sel: Selection): { content: string; selection: Selection } {
  if (sel.start !== sel.end) {
    return {
      content: content.slice(0, sel.start) + content.slice(sel.end),
      selection: { start: sel.start, end: sel.start }
    };
  }
  if (sel.start === 0) return { content, selection: sel };
  const at = sel.start - 1;
  return { content: content.slice(0, at) + content.slice(sel.start), selection: { start: at, end: at } };
}

export function deleteForward(content: string, sel: Selection): { content: string; selection: Selection } {
  if (sel.start !== sel.end) {
    return {
      content: content.slice(0, sel.start) + content.slice(sel.end),
      selection: { start: sel.start, end: sel.start }
    };
  }
  if (sel.start >= content.length) return { content, selection: sel };
  return { content: content.slice(0, sel.start) + content.slice(sel.start + 1), selection: sel };
}

export function autoPairInsert(
  content: string,
  sel: Selection,
  text: string
): { content: string; selection: Selection } {
  if (text.length === 1 && PAIR_MAP[text]) {
    const close = PAIR_MAP[text];
    if (sel.start === sel.end && content[sel.start] === close) {
      return { content, selection: { start: sel.start + 1, end: sel.start + 1 } };
    }
    const next = content.slice(0, sel.start) + text + close + content.slice(sel.end);
    const pos = sel.start + 1;
    return { content: next, selection: { start: pos, end: pos } };
  }
  return insertText(content, sel, text);
}

export function wrapSelection(
  content: string,
  sel: Selection,
  prefix: string,
  suffix: string
): { content: string; selection: Selection } {
  const before = content.slice(sel.start - prefix.length, sel.start);
  const after = content.slice(sel.end, sel.end + suffix.length);
  if (before === prefix && after === suffix) {
    const next =
      content.slice(0, sel.start - prefix.length) +
      content.slice(sel.start, sel.end) +
      content.slice(sel.end + suffix.length);
    const start = sel.start - prefix.length;
    return { content: next, selection: { start, end: start + (sel.end - sel.start) } };
  }
  let s = sel.start;
  let e = sel.end;
  if (content.slice(s - prefix.length, s) === prefix && content.slice(e, e + suffix.length) === suffix) {
    s -= prefix.length;
    e += suffix.length;
  }
  const next = content.slice(0, s) + prefix + content.slice(s, e) + suffix + content.slice(e);
  const start = s + prefix.length;
  return { content: next, selection: { start, end: start + (e - s) } };
}

export function toggleHeading(
  content: string,
  sel: Selection,
  level: number
): { content: string; selection: Selection } {
  const line = getLine(content, sel.start);
  const m = line.text.match(/^(#{1,6})\s*/);
  if (m && m[1].length === level) {
    const text = line.text.replace(/^#{1,6}\s*/, '');
    const next = content.slice(0, line.start) + text + content.slice(line.end);
    const removed = line.end - (line.start + text.length);
    const pos = Math.min(Math.max(line.start, sel.start - removed), line.start + text.length);
    return { content: next, selection: { start: pos, end: pos } };
  }
  const text = line.text.replace(/^#{1,6}\s*/, '');
  const next = content.slice(0, line.start) + '#'.repeat(level) + ' ' + text + content.slice(line.end);
  const pos = sel.start + level + 1;
  return { content: next, selection: { start: pos, end: pos } };
}

export function toggleList(
  content: string,
  sel: Selection,
  ordered: boolean
): { content: string; selection: Selection } {
  const line = getLine(content, sel.start);
  const m = line.text.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
  if (m && /^\d/.test(m[2]) === ordered) {
    const removed = line.text.length - m[3].length;
    const next = content.slice(0, line.start) + m[3] + content.slice(line.end);
    const pos = Math.min(Math.max(line.start, sel.start - removed), line.start + m[3].length);
    return { content: next, selection: { start: pos, end: pos } };
  }
  const marker = ordered ? '1. ' : '- ';
  const next = content.slice(0, line.start) + marker + line.text + content.slice(line.end);
  const pos = sel.start + marker.length;
  return { content: next, selection: { start: pos, end: pos } };
}

export function toggleBlockquote(content: string, sel: Selection): { content: string; selection: Selection } {
  const line = getLine(content, sel.start);
  if (line.text.startsWith('> ')) {
    const next = content.slice(0, line.start) + line.text.slice(2) + content.slice(line.end);
    const pos = Math.min(Math.max(line.start, sel.start - 2), line.start + line.text.length - 2);
    return { content: next, selection: { start: pos, end: pos } };
  }
  const next = content.slice(0, line.start) + '> ' + line.text + content.slice(line.end);
  const pos = sel.start + 2;
  return { content: next, selection: { start: pos, end: pos } };
}

export function indent(
  content: string,
  sel: Selection,
  outdent: boolean
): { content: string; selection: Selection } {
  const line = getLine(content, sel.start);
  if (outdent) {
    const m = line.text.match(/^ {1,4}/);
    if (!m) return { content, selection: sel };
    const next = content.slice(0, line.start) + line.text.slice(m[0].length) + content.slice(line.end);
    const pos = Math.min(Math.max(line.start, sel.start - m[0].length), line.start + line.text.length - m[0].length);
    return { content: next, selection: { start: pos, end: pos } };
  }
  const next = content.slice(0, line.start) + '  ' + line.text + content.slice(line.end);
  const pos = sel.start + 2;
  return { content: next, selection: { start: pos, end: pos } };
}

export function handleEnter(content: string, sel: Selection): { content: string; selection: Selection } {
  const line = getLine(content, sel.start);
  const text = line.text;
  const listM = text.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
  if (listM) {
    const [, ind, marker, rest] = listM;
    if (rest.trim() === '') {
      const next = content.slice(0, line.start) + '\n' + content.slice(line.end);
      const pos = line.start + 1;
      return { content: next, selection: { start: pos, end: pos } };
    }
    const newMarker = /^\d/.test(marker) ? '1. ' : marker + ' ';
    const next = content.slice(0, sel.start) + '\n' + ind + newMarker + content.slice(sel.end);
    const pos = sel.start + 1 + ind.length + newMarker.length;
    return { content: next, selection: { start: pos, end: pos } };
  }
  const quoteM = text.match(/^>\s?(.*)$/);
  if (quoteM) {
    if (quoteM[1].trim() === '') {
      const next = content.slice(0, line.start) + '\n' + content.slice(line.end);
      const pos = line.start + 1;
      return { content: next, selection: { start: pos, end: pos } };
    }
    const next = content.slice(0, sel.start) + '\n> ' + content.slice(sel.end);
    const pos = sel.start + 3;
    return { content: next, selection: { start: pos, end: pos } };
  }
  const next = content.slice(0, sel.start) + '\n' + content.slice(sel.end);
  const pos = sel.start + 1;
  return { content: next, selection: { start: pos, end: pos } };
}

export function applyAction(
  content: string,
  sel: Selection,
  action: EditorAction
): { content: string; selection: Selection } {
  switch (action) {
    case 'bold':
      return wrapSelection(content, sel, '**', '**');
    case 'italic':
      return wrapSelection(content, sel, '*', '*');
    case 'code':
      return wrapSelection(content, sel, '`', '`');
    case 'link':
      return wrapSelection(content, sel, '[', '](url)');
    case 'h1':
      return toggleHeading(content, sel, 1);
    case 'h2':
      return toggleHeading(content, sel, 2);
    case 'h3':
      return toggleHeading(content, sel, 3);
    case 'ul':
      return toggleList(content, sel, false);
    case 'ol':
      return toggleList(content, sel, true);
    case 'quote':
      return toggleBlockquote(content, sel);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/editorActions.test.ts`
Expected: PASS (all 20 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/editorActions.ts tests/unit/editorActions.test.ts
git commit -m "feat: add pure editor text actions"
```

---

### Task 5: Markdown rendering pipeline with cursor mapping

**Files:**
- Create: `src/lib/markdown.ts`
- Test: `tests/unit/markdown.test.ts`

**Interfaces:**
- Consumes: `markdown-it`, `highlight.js`, `katex`.
- Produces: `renderMarkdown(content: string): string` (HTML with `data-bi` blocks and `data-s`/`data-e` text spans), `extractHeadings(content): Heading[]`, `lineStarts(content): number[]`, `escapeHtml(s): string`.

- [ ] **Step 1: Write failing tests**

`tests/unit/markdown.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown, extractHeadings } from '../../src/lib/markdown';

describe('renderMarkdown', () => {
  it('renders headings with data-bi and source offsets', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1 data-bi="0">');
    expect(html).toContain('<span data-s="2" data-e="7">Hello</span>');
  });

  it('renders bold with source offsets', () => {
    expect(renderMarkdown('**bold**')).toBe(
      '<p data-bi="0"><strong><span data-s="2" data-e="6">bold</span></strong></p>'
    );
  });

  it('renders inline code', () => {
    expect(renderMarkdown('`code`')).toBe(
      '<p data-bi="0"><code><span data-s="1" data-e="5">code</span></code></p>'
    );
  });

  it('renders links', () => {
    expect(renderMarkdown('[t](http://x.y)')).toBe(
      '<p data-bi="0"><a href="http://x.y" data-link><span data-s="1" data-e="2">t</span></a></p>'
    );
  });

  it('renders strikethrough', () => {
    expect(renderMarkdown('~~x~~')).toBe(
      '<p data-bi="0"><del><span data-s="2" data-e="3">x</span></del></p>'
    );
  });

  it('renders bullet lists', () => {
    const html = renderMarkdown('- a\n- b');
    expect(html).toContain('<ul data-bi="0">');
    expect(html).toContain('<li><span data-s="2" data-e="3">a</span></li>');
    expect(html).toContain('<li><span data-s="6" data-e="7">b</span></li>');
  });

  it('renders ordered lists', () => {
    const html = renderMarkdown('1. a');
    expect(html).toContain('<ol data-bi="0">');
    expect(html).toContain('<span data-s="3" data-e="4">a</span>');
  });

  it('renders blockquotes', () => {
    const html = renderMarkdown('> q');
    expect(html).toContain('<blockquote data-bi="0">');
    expect(html).toContain('<span data-s="2" data-e="3">q</span>');
  });

  it('renders fenced code with highlight and source offsets', () => {
    const html = renderMarkdown('```js\nlet x = 1\n```');
    expect(html).toContain('<pre data-bi="0">');
    expect(html).toContain('class="language-js"');
    expect(html).toContain('<span data-s="5" data-e="13">');
  });

  it('renders mermaid fences', () => {
    expect(renderMarkdown('```mermaid\ngraph TD\n```')).toContain('<pre class="mermaid" data-bi="0">');
  });

  it('renders tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table data-bi="0">');
    expect(html).toContain('<th><span data-s="2" data-e="3">a</span></th>');
    expect(html).toContain('<td><span data-s="20" data-e="21">1</span></td>');
  });

  it('renders display math via katex', () => {
    const html = renderMarkdown('$$a+b$$');
    expect(html).toContain('<span class="math" data-s="0" data-e="8">');
  });

  it('escapes html in text', () => {
    expect(renderMarkdown('a < b')).toContain('a &lt; b');
  });
});

describe('extractHeadings', () => {
  it('extracts level, text and source position', () => {
    expect(extractHeadings('# A\n## B')).toEqual([
      { level: 1, text: 'A', pos: 2 },
      { level: 2, text: 'B', pos: 7 }
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/markdown.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/markdown.ts`:
```ts
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import katex from 'katex';

const md = new MarkdownIt({ html: true, typographer: false, breaks: false });

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function lineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function textSpan(text: string, s: number, e: number): string {
  return `<span data-s="${s}" data-e="${e}">${escapeHtml(text)}</span>`;
}

function mathSpan(latex: string, s: number, e: number): string {
  const html = katex.renderToString(latex, { displayMode: true, throwOnError: false });
  return `<span class="math" data-s="${s}" data-e="${e}">${html}</span>`;
}

interface InlineCtx {
  pos: number;
}

function renderInline(tokens: MarkdownIt.Token[], ctx: InlineCtx): string {
  let out = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text': {
        const mathM = t.content.match(/^\$\$([\s\S]+?)\$\$/);
        if (mathM) {
          out += mathSpan(mathM[1], ctx.pos, ctx.pos + t.content.length);
          ctx.pos += t.content.length;
        } else {
          out += textSpan(t.content, ctx.pos, ctx.pos + t.content.length);
          ctx.pos += t.content.length;
        }
        break;
      }
      case 'code': {
        out += `<code>${textSpan(t.content, ctx.pos + 1, ctx.pos + 1 + t.content.length)}</code>`;
        ctx.pos += t.content.length + 2;
        break;
      }
      case 'em':
      case 'strong':
      case 's': {
        const tag = t.type === 'em' ? 'em' : t.type === 'strong' ? 'strong' : 'del';
        const ml = t.markup.length;
        ctx.pos += ml;
        out += `<${tag}>`;
        out += renderInline(t.children, ctx);
        ctx.pos += ml;
        out += `</${tag}>`;
        break;
      }
      case 'link': {
        out += `<a href="${escAttr(t.href ?? '')}" data-link>`;
        ctx.pos += 1;
        out += renderInline(t.children, ctx);
        ctx.pos += 2 + (t.href ?? '').length + 1;
        out += '</a>';
        break;
      }
      case 'image': {
        ctx.pos += 2;
        out += renderInline(t.children, ctx);
        ctx.pos += 2 + (t.src ?? '').length + 1;
        out += `<img src="${escAttr(t.src ?? '')}" alt="${escAttr(t.content)}">`;
        break;
      }
      case 'html_inline': {
        out += t.content;
        ctx.pos += t.content.length;
        break;
      }
      case 'softbreak':
      case 'hardbreak': {
        out += '<br>';
        ctx.pos += t.type === 'hardbreak' ? 3 : 1;
        break;
      }
    }
  }
  return out;
}

function inlinePos(t: MarkdownIt.Token, starts: number[]): number {
  return t.map ? starts[t.map[0]] : 0;
}

function renderFence(t: MarkdownIt.Token, starts: number[], content: string, bi: number): string {
  const [ls, le] = t.map!;
  const s = starts[ls];
  const e = le < starts.length ? starts[le] - 1 : content.length;
  const lang = t.info || '';
  if (lang === 'mermaid') {
    return `<pre class="mermaid" data-bi="${bi}"><span data-s="${s}" data-e="${e}"><code>${escapeHtml(
      t.content
    )}</code></span></pre>`;
  }
  let body: string;
  let cls = '';
  if (lang && hljs.getLanguage(lang)) {
    body = hljs.highlight(t.content, { language: lang, ignoreIllegals: true }).value;
    cls = ` class="language-${lang}"`;
  } else {
    body = escapeHtml(t.content);
  }
  return `<pre data-bi="${bi}"><span data-s="${s}" data-e="${e}"><code${cls}>${body}</code></span></pre>`;
}

export function renderMarkdown(content: string): string {
  const tokens = md.parse(content);
  const starts = lineStarts(content);
  let bi = 0;
  const nextBi = () => bi++;
  let html = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'heading_open':
        html += `<${t.tag} data-bi="${nextBi()}">`;
        break;
      case 'heading':
        html += renderInline(t.children, { pos: inlinePos(t, starts) });
        break;
      case 'heading_close':
        html += `</${t.tag}>`;
        break;
      case 'paragraph_open':
        html += `<p data-bi="${nextBi()}">`;
        break;
      case 'paragraph':
        html += renderInline(t.children, { pos: inlinePos(t, starts) });
        break;
      case 'paragraph_close':
        html += '</p>';
        break;
      case 'blockquote_open':
        html += `<blockquote data-bi="${nextBi()}">`;
        break;
      case 'blockquote_close':
        html += '</blockquote>';
        break;
      case 'bullet_list_open':
        html += `<ul data-bi="${nextBi()}">`;
        break;
      case 'bullet_list_close':
        html += '</ul>';
        break;
      case 'ordered_list_open':
        html += `<ol data-bi="${nextBi()}">`;
        break;
      case 'ordered_list_close':
        html += '</ol>';
        break;
      case 'list_item_open':
        html += '<li>';
        break;
      case 'list_item_close':
        html += '</li>';
        break;
      case 'fence':
        html += renderFence(t, starts, content, nextBi());
        break;
      case 'table_open':
        html += `<table data-bi="${nextBi()}">`;
        break;
      case 'table_close':
        html += '</table>';
        break;
      case 'thead_open':
        html += '<thead>';
        break;
      case 'thead_close':
        html += '</thead>';
        break;
      case 'tr_open':
        html += '<tr>';
        break;
      case 'tr_close':
        html += '</tr>';
        break;
      case 'th_open':
        html += '<th>';
        break;
      case 'th_close':
        html += '</th>';
        break;
      case 'td_open':
        html += '<td>';
        break;
      case 'td_close':
        html += '</td>';
        break;
      case 'th':
      case 'td':
        html += renderInline(t.children, { pos: inlinePos(t, starts) });
        break;
      case 'html_block':
        html += t.content;
        break;
    }
  }
  return html;
}

export interface Heading {
  level: number;
  text: string;
  pos: number;
}

export function extractHeadings(content: string): Heading[] {
  const tokens = md.parse(content);
  const starts = lineStarts(content);
  const out: Heading[] = [];
  for (const t of tokens) {
    if (t.type === 'heading' && t.map) {
      out.push({
        level: Number(t.tag.slice(1)),
        text: t.content,
        pos: starts[t.map[0]] + t.markup.length + 1
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/markdown.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown.ts tests/unit/markdown.test.ts
git commit -m "feat: add markdown rendering pipeline with cursor mapping"
```

---

### Task 6: Cursor save/restore

**Files:**
- Create: `src/lib/cursor.ts`
- Test: `tests/unit/cursor.test.ts`

**Interfaces:**
- Consumes: `Selection` from `editorActions`, DOM Selection/Range API.
- Produces: `domSelectionToSource(root, sel): Selection`, `sourceToDomSelection(root, sel): boolean` (false when no text runs exist — caller keeps fallback behavior).

- [ ] **Step 1: Write failing tests**

`tests/unit/cursor.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/lib/markdown';
import { domSelectionToSource, sourceToDomSelection } from '../../src/lib/cursor';

function makeRoot(html: string): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('cursor', () => {
  it('sourceToDomSelection places cursor in the right text node', () => {
    const root = makeRoot(renderMarkdown('# Hello'));
    expect(sourceToDomSelection(root, { start: 2, end: 7 })).toBe(true);
    const sel = window.getSelection()!;
    expect(sel.anchorNode?.nodeValue).toBe('Hello');
    expect(sel.anchorOffset).toBe(0);
  });

  it('domSelectionToSource maps back into the source range (approximate)', () => {
    const root = makeRoot(renderMarkdown('# Hello **bold**'));
    const node = root.querySelector('span[data-s="2"]')!.firstChild as Text;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(node, 2);
    range.setEnd(node, 2);
    sel.removeAllRanges();
    sel.addRange(range);
    const mapped = domSelectionToSource(root, {
      anchorNode: node,
      anchorOffset: 2,
      focusNode: node,
      focusOffset: 2
    });
    expect(mapped.start).toBeGreaterThanOrEqual(2);
    expect(mapped.start).toBeLessThanOrEqual(7);
    expect(mapped.end).toBe(mapped.start);
  });

  it('falls back to false when there are no text runs', () => {
    expect(sourceToDomSelection(makeRoot(''), { start: 0, end: 0 })).toBe(false);
  });

  it('maps offsets inside bold text', () => {
    const root = makeRoot(renderMarkdown('**bold**'));
    sourceToDomSelection(root, { start: 4, end: 4 });
    const sel = window.getSelection()!;
    const node = root.querySelector('span[data-s="2"]')!.firstChild as Text;
    expect(sel.anchorNode).toBe(node);
    expect(sel.anchorOffset).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cursor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/cursor.ts`:
```ts
import type { Selection } from './editorActions';

interface Run {
  node: Text;
  srcStart: number;
  srcEnd: number;
}

function textRuns(root: HTMLElement): Run[] {
  const runs: Run[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const span = node.parentElement?.closest('[data-s]') ?? null;
    if (!span) continue;
    runs.push({ node, srcStart: Number(span.dataset.s), srcEnd: Number(span.dataset.e) });
  }
  return runs;
}

function lastTextIn(node: Node): Text | null {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  while (walker.nextNode()) last = walker.currentNode as Text;
  return last;
}

function mapPos(runs: Run[], node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const run = runs.find(r => r.node === node);
    if (!run) return 0;
    const len = node.nodeValue.length;
    if (len === 0) return run.srcStart;
    const frac = Math.max(0, Math.min(1, offset / len));
    return Math.round(run.srcStart + (run.srcEnd - run.srcStart) * frac);
  }
  let target: Text | null = null;
  if (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length > 0) {
    const child = node.childNodes[Math.min(offset, node.childNodes.length - 1)];
    target = child.nodeType === Node.TEXT_NODE ? (child as Text) : lastTextIn(child);
  }
  if (!target) target = lastTextIn(node);
  if (!target) return 0;
  const run = runs.find(r => r.node === target);
  return run ? run.srcEnd : 0;
}

export interface DomSelectionLike {
  anchorNode: Node;
  anchorOffset: number;
  focusNode: Node;
  focusOffset: number;
}

export function domSelectionToSource(root: HTMLElement, sel: DomSelectionLike): Selection {
  const runs = textRuns(root);
  const a = mapPos(runs, sel.anchorNode, sel.anchorOffset);
  const f = mapPos(runs, sel.focusNode, sel.focusOffset);
  return { start: Math.min(a, f), end: Math.max(a, f) };
}

export function sourceToDomSelection(root: HTMLElement, sel: Selection): boolean {
  const runs = textRuns(root);
  const place = (pos: number): { node: Text; offset: number } | null => {
    for (const r of runs) {
      if (pos <= r.srcEnd) {
        const len = r.node.nodeValue.length;
        if (len === 0) return { node: r.node, offset: 0 };
        const frac = r.srcEnd > r.srcStart ? (pos - r.srcStart) / (r.srcEnd - r.srcStart) : 0;
        return { node: r.node, offset: Math.min(len, Math.max(0, Math.round(frac * len))) };
      }
    }
    const last = runs[runs.length - 1];
    return last ? { node: last.node, offset: last.node.nodeValue.length } : null;
  };
  const selection = window.getSelection();
  if (!selection) return false;
  const a = place(sel.start);
  const f = place(sel.end);
  if (!a || !f) return false;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(f.node, f.offset);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cursor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cursor.ts tests/unit/cursor.test.ts
git commit -m "feat: add cursor save and restore utilities"
```

---

### Task 7: WysiwygEditor component

**Files:**
- Create: `src/components/WysiwygEditor.tsx`
- Test: `tests/unit/wysiwyg.test.tsx`

**Interfaces:**
- Consumes: `renderMarkdown`, `sourceToDomSelection`, `domSelectionToSource`, all `editorActions`.
- Produces: default export React component with props `{ content, selection, onChange(content, selection), fontSize?, typewriter? }` and imperative handle `WysiwygEditorHandle { execute(action), focus() }`.

- [ ] **Step 1: Write failing tests**

`tests/unit/wysiwyg.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import WysiwygEditor, { WysiwygEditorHandle } from '../../src/components/WysiwygEditor';
import type { Selection } from '../../src/lib/editorActions';

function Harness({ editorRef }: { editorRef: React.Ref<WysiwygEditorHandle> }) {
  const [content, setContent] = useState('');
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const onChange = (c: string, s: Selection) => {
    setContent(c);
    setSelection(s);
  };
  return <WysiwygEditor ref={editorRef} content={content} selection={selection} onChange={onChange} />;
}

describe('WysiwygEditor', () => {
  afterEach(cleanup);

  it('renders typed text live with source offsets', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} />);
    const box = h.getByRole('textbox');
    fireEvent.beforeInput(box, { data: 'a', inputType: 'insertText' } as unknown as InputEvent);
    expect(box.innerHTML).toContain('<span data-s="0" data-e="1">a</span>');
  });

  it('backspace removes the previous character', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} />);
    const box = h.getByRole('textbox');
    fireEvent.beforeInput(box, { data: 'a', inputType: 'insertText' } as unknown as InputEvent);
    fireEvent.keyDown(box, { key: 'Backspace' });
    expect(box.innerHTML).toBe('');
  });

  it('ctrl+b wraps the DOM selection', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} />);
    const box = h.getByRole('textbox');
    fireEvent.beforeInput(box, { data: 'a', inputType: 'insertText' } as unknown as InputEvent);
    fireEvent.beforeInput(box, { data: 'b', inputType: 'insertText' } as unknown as InputEvent);
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(box);
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(box, { key: 'b', ctrlKey: true });
    expect(box.innerHTML).toContain('**ab**');
  });

  it('execute() applies actions from the toolbar', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} />);
    const box = h.getByRole('textbox');
    fireEvent.beforeInput(box, { data: 'x', inputType: 'insertText' } as unknown as InputEvent);
    act(() => {
      ref.current?.execute('bold');
    });
    expect(box.innerHTML).toContain('<strong><span data-s="0" data-e="1">x</span></strong>');
  });
});
```

Note: the `ctrl+b` test depends on the `selectionchange` listener syncing the DOM selection back to source offsets (see Step 2 implementation). If it fails, fix the listener before moving on.

- [ ] **Step 2: Write the component**

`src/components/WysiwygEditor.tsx`:
```tsx
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import mermaid from 'mermaid';
import { renderMarkdown } from '../lib/markdown';
import { domSelectionToSource, sourceToDomSelection } from '../lib/cursor';
import {
  applyAction,
  autoPairInsert,
  backspace,
  deleteForward,
  handleEnter,
  indent,
  insertText,
  type EditorAction,
  type Selection
} from '../lib/editorActions';

export interface WysiwygEditorHandle {
  execute(action: EditorAction): void;
  focus(): void;
}

interface Props {
  content: string;
  selection: Selection;
  onChange(content: string, selection: Selection): void;
  fontSize?: number;
  typewriter?: boolean;
}

const SHORTCUTS_PLAIN: Record<string, EditorAction> = {
  b: 'bold',
  i: 'italic',
  k: 'link',
  '`': 'code'
};

const SHORTCUTS_SHIFT: Record<string, EditorAction> = {
  '1': 'h1',
  '2': 'h2',
  '3': 'h3',
  l: 'ul',
  '7': 'ol',
  q: 'quote'
};

export default forwardRef<WysiwygEditorHandle, Props>(function WysiwygEditor(
  { content, selection, onChange, fontSize = 16, typewriter = false },
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const skipSync = useRef(false);

  const apply = useCallback(
    (next: { content: string; selection: Selection }) => {
      onChange(next.content, next.selection);
    },
    [onChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      execute: (action: EditorAction) => {
        apply(applyAction(content, selection, action));
      },
      focus: () => {
        rootRef.current?.focus();
      }
    }),
    [content, selection, apply]
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = renderMarkdown(content);
    sourceToDomSelection(root, selection);
    if (typewriter) {
      const sel = window.getSelection();
      if (sel && sel.anchorNode && root.contains(sel.anchorNode)) {
        const block = (sel.anchorNode.parentElement ?? root).closest('[data-bi]');
        if (block) block.setAttribute('data-active-line', 'true');
      }
    }
    skipSync.current = true;
    try {
      mermaid.run({ querySelector: '.mermaid' });
    } catch {
      // mermaid render failure: raw text stays visible in the block
    }
  }, [content, selection, typewriter]);

  useEffect(() => {
    const onSelectionChange = () => {
      if (skipSync.current) {
        skipSync.current = false;
        return;
      }
      const root = rootRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer)) return;
      const next = domSelectionToSource(root, {
        anchorNode: range.startContainer,
        anchorOffset: range.startOffset,
        focusNode: range.endContainer,
        focusOffset: range.endOffset
      });
      if (next.start !== selection.start || next.end !== selection.end) {
        onChange(content, next);
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [content, selection, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (composing.current) return;
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      const action = e.shiftKey ? SHORTCUTS_SHIFT[k] : SHORTCUTS_PLAIN[k];
      if (action) {
        e.preventDefault();
        apply(applyAction(content, selection, action));
      }
      return;
    }
    switch (e.key) {
      case 'Backspace':
        e.preventDefault();
        apply(backspace(content, selection));
        return;
      case 'Delete':
        e.preventDefault();
        apply(deleteForward(content, selection));
        return;
      case 'Tab':
        e.preventDefault();
        apply(indent(content, selection, !e.shiftKey));
        return;
      case 'Enter':
        e.preventDefault();
        apply(handleEnter(content, selection));
        return;
    }
  };

  const handleBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (composing.current) return;
    const ev = e.nativeEvent as InputEvent;
    if (ev.inputType === 'insertText' && ev.data) {
      e.preventDefault();
      apply(autoPairInsert(content, selection, ev.data));
    }
  };

  return (
    <div
      ref={rootRef}
      role="textbox"
      aria-label="Markdown editor"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-typewriter={typewriter}
      onKeyDown={handleKeyDown}
      onBeforeInput={handleBeforeInput}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e: React.CompositionEvent<HTMLDivElement>) => {
        composing.current = false;
        if (e.data) apply(insertText(content, selection, e.data));
      }}
      style={{ fontSize: `${fontSize}px` }}
      className="wysiwyg-root"
    />
  );
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/unit/wysiwyg.test.tsx`
Expected: PASS (4 tests). Also run `npx tsc --noEmit` (no type errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/WysiwygEditor.tsx tests/unit/wysiwyg.test.tsx
git commit -m "feat: add WYSIWYG editor component"
```

---

### Task 8: Toolbar

**Files:**
- Create: `src/components/Toolbar.tsx`
- Test: `tests/unit/toolbar.test.tsx`

**Interfaces:**
- Consumes: `EditorAction` from `editorActions`.
- Produces: default export with props `{ onAction, theme, themes, onThemeChange, typewriter, onToggleTypewriter }`.

- [ ] **Step 1: Write failing tests**

`tests/unit/toolbar.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Toolbar from '../../src/components/Toolbar';

const props = {
  onAction: () => {},
  theme: 'light',
  themes: ['light', 'dark'],
  onThemeChange: () => {},
  typewriter: false,
  onToggleTypewriter: () => {}
};

describe('Toolbar', () => {
  afterEach(cleanup);

  it('emits actions for format buttons', () => {
    const onAction = vi.fn();
    render(<Toolbar {...props} onAction={onAction} />);
    fireEvent.click(screen.getByTitle('Bold (Ctrl+B)'));
    expect(onAction).toHaveBeenCalledWith('bold');
    fireEvent.click(screen.getByTitle('Heading 1 (Ctrl+Shift+1)'));
    expect(onAction).toHaveBeenCalledWith('h1');
  });

  it('switches theme via the select', () => {
    const onThemeChange = vi.fn();
    render(<Toolbar {...props} onThemeChange={onThemeChange} />);
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('toggles typewriter mode', () => {
    const onToggleTypewriter = vi.fn();
    render(<Toolbar {...props} onToggleTypewriter={onToggleTypewriter} />);
    fireEvent.click(screen.getByTitle('Toggle typewriter mode'));
    expect(onToggleTypewriter).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/toolbar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

`src/components/Toolbar.tsx`:
```tsx
import type { EditorAction } from '../lib/editorActions';

interface Props {
  onAction(a: EditorAction): void;
  theme: string;
  themes: string[];
  onThemeChange(theme: string): void;
  typewriter: boolean;
  onToggleTypewriter(): void;
}

const ACTIONS: Array<{ label: string; title: string; action: EditorAction }> = [
  { label: 'B', title: 'Bold (Ctrl+B)', action: 'bold' },
  { label: 'I', title: 'Italic (Ctrl+I)', action: 'italic' },
  { label: 'H1', title: 'Heading 1 (Ctrl+Shift+1)', action: 'h1' },
  { label: 'H2', title: 'Heading 2 (Ctrl+Shift+2)', action: 'h2' },
  { label: 'H3', title: 'Heading 3 (Ctrl+Shift+3)', action: 'h3' },
  { label: '•', title: 'Bullet list (Ctrl+Shift+L)', action: 'ul' },
  { label: '1.', title: 'Numbered list (Ctrl+Shift+7)', action: 'ol' },
  { label: '❝', title: 'Blockquote (Ctrl+Shift+Q)', action: 'quote' },
  { label: '</>', title: 'Inline code (Ctrl+`)', action: 'code' },
  { label: 'Link', title: 'Link (Ctrl+K)', action: 'link' }
];

export default function Toolbar({ onAction, theme, themes, onThemeChange, typewriter, onToggleTypewriter }: Props) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border)] text-sm select-none">
      {ACTIONS.map(a => (
        <button
          key={a.action}
          title={a.title}
          onClick={() => onAction(a.action)}
          className="rounded px-2 py-0.5 hover:bg-[var(--accent-soft)]"
        >
          {a.label}
        </button>
      ))}
      <span className="flex-1" />
      <label className="text-xs opacity-70" htmlFor="theme-select">
        Theme
      </label>
      <select
        id="theme-select"
        value={theme}
        onChange={e => onThemeChange(e.target.value)}
        className="rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5"
      >
        {themes.map(t => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        title="Toggle typewriter mode"
        onClick={onToggleTypewriter}
        className={`rounded px-2 py-0.5 ${typewriter ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]'}`}
      >
        Typewriter
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/toolbar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/Toolbar.tsx tests/unit/toolbar.test.tsx
git commit -m "feat: add formatting toolbar with shortcuts"
```

---

### Task 9: Sidebar, FileExplorer, OutlineView

**Files:**
- Create: `src/components/Sidebar.tsx`, `src/components/FileExplorer.tsx`, `src/components/OutlineView.tsx`
- Test: `tests/unit/sidebar.test.tsx`

**Interfaces:**
- Consumes: `FileNode` from `src/types` (created in Task 11 — if needed earlier, define `FileNode` locally in `FileExplorer.tsx` and keep the shared copy in sync; simpler: create `src/types.ts` in this task with `FileNode` only, Task 11 extends it), `extractHeadings` from `markdown`.
- Produces: `Sidebar` with props `{ mode, onToggle, tree, rootDir, onOpenFile, onCreate, onRename, onDelete, content, onJump, onOpenFolder }`.

- [ ] **Step 1: Write `src/types.ts` (initial)**

```ts
export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}
```

- [ ] **Step 2: Write failing tests**

`tests/unit/sidebar.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Sidebar from '../../src/components/Sidebar';
import type { FileNode } from '../../src/types';

const tree: FileNode[] = [
  {
    name: 'docs',
    path: '/r/docs',
    isDir: true,
    children: [{ name: 'a.md', path: '/r/docs/a.md', isDir: false }]
  },
  { name: 'b.md', path: '/r/b.md', isDir: false }
];

const baseProps = {
  mode: 'files' as const,
  onToggle: () => {},
  tree,
  rootDir: '/r',
  onOpenFile: () => {},
  onCreate: () => {},
  onRename: () => {},
  onDelete: () => {},
  content: '# Hi',
  onJump: () => {},
  onOpenFolder: () => {}
};

describe('Sidebar', () => {
  afterEach(cleanup);

  it('opens a file on click', () => {
    const onOpenFile = vi.fn();
    render(<Sidebar {...baseProps} onOpenFile={onOpenFile} />);
    fireEvent.click(screen.getByText('b.md'));
    expect(onOpenFile).toHaveBeenCalledWith('/r/b.md');
  });

  it('expands directories on toggle', () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.queryByText('a.md')).toBeNull();
    fireEvent.click(screen.getByText('docs'));
    expect(screen.getByText('a.md')).not.toBeNull();
  });

  it('shows outline headings and jumps on click', () => {
    const onJump = vi.fn();
    render(<Sidebar {...baseProps} mode="outline" onJump={onJump} />);
    fireEvent.click(screen.getByText('Hi'));
    expect(onJump).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/sidebar.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write the components**

`src/components/FileExplorer.tsx`:
```tsx
import { useState } from 'react';
import type { FileNode } from '../types';

interface Props {
  tree: FileNode[];
  rootDir: string | null;
  onOpenFile(path: string): void;
  onCreate(path: string): void;
  onRename(from: string, to: string): void;
  onDelete(path: string): void;
}

export default function FileExplorer({ tree, rootDir, onOpenFile, onCreate, onRename, onDelete }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);

  if (!rootDir) {
    return <div className="p-3 text-sm opacity-60">No folder open.</div>;
  }

  const toggle = (p: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const menuActions = (path: string) => {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const parent = path.slice(0, path.lastIndexOf('/') + 1);
    return (
      <div className="flex gap-1 text-xs py-1">
        <button
          className="rounded border border-[var(--border)] px-1"
          onClick={() => {
            const n = window.prompt('New file name');
            if (n) onCreate(`${path}/${n}`);
            setMenuFor(null);
          }}
        >
          New
        </button>
        <button
          className="rounded border border-[var(--border)] px-1"
          onClick={() => {
            const n = window.prompt('New name', name);
            if (n) onRename(path, `${parent}${n}`);
            setMenuFor(null);
          }}
        >
          Rename
        </button>
        <button
          className="rounded border border-[var(--border)] px-1"
          onClick={() => {
            onDelete(path);
            setMenuFor(null);
          }}
        >
          Delete
        </button>
      </div>
    );
  };

  const renderRow = (node: FileNode, depth: number) => {
    const padding = { paddingLeft: depth * 12 };
    const menuButton = (
      <button
        title="File actions"
        onClick={() => setMenuFor(menuFor === node.path ? null : node.path)}
        className="px-1"
      >
        ...
      </button>
    );
    if (node.isDir) {
      const open = expanded.has(node.path);
      return (
        <div key={node.path}>
          <div className="flex items-center">
            <span style={padding}>{open ? '-' : '+'}</span>
            <button onClick={() => toggle(node.path)} className="flex-1 text-left">
              {node.name}
            </button>
            {menuButton}
          </div>
          {menuFor === node.path && menuActions(node.path)}
          {open && (node.children ?? []).map(c => renderRow(c, depth + 1))}
        </div>
      );
    }
    return (
      <div key={node.path} className="flex items-center">
        <span style={padding} />
        <button onClick={() => onOpenFile(node.path)} className="flex-1 text-left">
          {node.name}
        </button>
        {menuButton}
        {menuFor === node.path && menuActions(node.path)}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto p-2 text-sm">
      {tree.map(n => renderRow(n, 0))}
    </div>
  );
}
```

`src/components/OutlineView.tsx`:
```tsx
import { extractHeadings } from '../lib/markdown';

interface Props {
  content: string;
  onJump(pos: number): void;
}

export default function OutlineView({ content, onJump }: Props) {
  const headings = extractHeadings(content);
  if (headings.length === 0) {
    return <div className="p-3 text-sm opacity-60">No headings.</div>;
  }
  return (
    <div className="flex-1 overflow-auto p-2 text-sm">
      {headings.map((h, i) => (
        <button
          key={i}
          style={{ paddingLeft: (h.level - 1) * 12 }}
          onClick={() => onJump(h.pos)}
          className="block w-full text-left"
        >
          {h.text || '(empty)'}
        </button>
      ))}
    </div>
  );
}
```

`src/components/Sidebar.tsx`:
```tsx
import FileExplorer from './FileExplorer';
import OutlineView from './OutlineView';
import type { FileNode } from '../types';

interface Props {
  mode: 'files' | 'outline';
  onToggle(): void;
  tree: FileNode[];
  rootDir: string | null;
  onOpenFile(path: string): void;
  onCreate(path: string): void;
  onRename(from: string, to: string): void;
  onDelete(path: string): void;
  content: string;
  onJump(pos: number): void;
  onOpenFolder(): void;
}

export default function Sidebar({
  mode,
  onToggle,
  tree,
  rootDir,
  onOpenFile,
  onCreate,
  onRename,
  onDelete,
  content,
  onJump,
  onOpenFolder
}: Props) {
  return (
    <aside className="flex w-64 flex-col border-r border-[var(--border)]">
      <div className="flex gap-1 border-b border-[var(--border)] p-2">
        <button
          onClick={onToggle}
          className="rounded px-2 py-0.5 hover:bg-[var(--accent-soft)]"
        >
          {mode === 'files' ? 'Outline' : 'Files'}
        </button>
        {mode === 'files' && !rootDir && (
          <button
            onClick={onOpenFolder}
            className="rounded px-2 py-0.5 hover:bg-[var(--accent-soft)]"
          >
            Open folder
          </button>
        )}
      </div>
      {mode === 'files' ? (
        <FileExplorer
          tree={tree}
          rootDir={rootDir}
          onOpenFile={onOpenFile}
          onCreate={onCreate}
          onRename={onRename}
          onDelete={onDelete}
        />
      ) : (
        <OutlineView content={content} onJump={onJump} />
      )}
    </aside>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/sidebar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/components/Sidebar.tsx src/components/FileExplorer.tsx src/components/OutlineView.tsx tests/unit/sidebar.test.tsx
git commit -m "feat: add sidebar with file explorer and outline"
```

---

### Task 10: ThemeManager and editor CSS

**Files:**
- Create: `src/components/ThemeManager.tsx`
- Modify: `src/index.css`
- Test: `tests/unit/theme.test.tsx`

**Interfaces:**
- Consumes: `window.api.readTheme` for custom themes.
- Produces: default export headless component `{ theme, onThemeChange }`; CSS variables `--bg`, `--fg`, `--border`, `--accent-soft`; editor typography and typewriter rules in `index.css`.

- [ ] **Step 1: Write failing tests**

`tests/unit/theme.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ThemeManager from '../../src/components/ThemeManager';

beforeEach(() => {
  window.api = {
    readTheme: vi.fn().mockResolvedValue(':root { --bg: #101010; }'),
    listThemes: vi.fn().mockResolvedValue([])
  } as unknown as typeof window.api;
});

afterEach(() => {
  cleanup();
  document.documentElement.style.cssText = '';
  document.getElementById('user-theme')?.remove();
});

describe('ThemeManager', () => {
  it('applies builtin light variables', () => {
    render(<ThemeManager theme="light" onThemeChange={() => {}} />);
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#ffffff');
  });

  it('applies builtin dark variables', () => {
    render(<ThemeManager theme="dark" onThemeChange={() => {}} />);
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#1e2124');
  });

  it('injects custom theme css', async () => {
    render(<ThemeManager theme="midnight" onThemeChange={() => {}} />);
    await new Promise(r => setTimeout(r, 10));
    expect(document.getElementById('user-theme')?.textContent).toBe(':root { --bg: #101010; }');
  });

  it('falls back to light when the theme file is missing', async () => {
    const onThemeChange = vi.fn();
    (window.api.readTheme as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
    render(<ThemeManager theme="missing" onThemeChange={onThemeChange} />);
    await new Promise(r => setTimeout(r, 10));
    expect(onThemeChange).toHaveBeenCalledWith('light');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/theme.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

`src/components/ThemeManager.tsx`:
```tsx
import { useEffect } from 'react';

const BUILTIN: Record<string, Record<string, string>> = {
  light: { '--bg': '#ffffff', '--fg': '#1f2328', '--border': '#d0d7de', '--accent-soft': '#eaeef2' },
  dark: { '--bg': '#1e2124', '--fg': '#d6dbe0', '--border': '#3d444b', '--accent-soft': '#2f353b' }
};

interface Props {
  theme: string;
  onThemeChange(theme: string): void;
}

export default function ThemeManager({ theme, onThemeChange }: Props) {
  useEffect(() => {
    const rootEl = document.documentElement;
    rootEl.dataset.theme = theme;
    const userTheme = document.getElementById('user-theme');
    if (BUILTIN[theme]) {
      userTheme?.remove();
      for (const [k, v] of Object.entries(BUILTIN[theme])) {
        rootEl.style.setProperty(k, v);
      }
    }
  }, [theme]);

  useEffect(() => {
    if (BUILTIN[theme]) return;
    let cancelled = false;
    window.api
      .readTheme(theme)
      .then(css => {
        if (cancelled) return;
        let el = document.getElementById('user-theme') as HTMLStyleElement | null;
        if (!el) {
          el = document.createElement('style');
          el.id = 'user-theme';
          document.head.appendChild(el);
        }
        el.textContent = css;
      })
      .catch(() => {
        onThemeChange('light');
      });
    return () => {
      cancelled = true;
    };
  }, [theme, onThemeChange]);

  return null;
}
```

- [ ] **Step 4: Extend `src/index.css`**

Replace the file with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #ffffff;
  --fg: #1f2328;
  --border: #d0d7de;
  --accent-soft: #eaeef2;
}

.wysiwyg-root {
  outline: none;
  max-width: 800px;
  margin: 0 auto;
  line-height: 1.6;
  caret-color: var(--fg);
}

.wysiwyg-root h1 { font-size: 1.8em; font-weight: 700; margin: 0.4em 0; }
.wysiwyg-root h2 { font-size: 1.5em; font-weight: 700; margin: 0.4em 0; }
.wysiwyg-root h3 { font-size: 1.25em; font-weight: 600; margin: 0.4em 0; }
.wysiwyg-root p { margin: 0.25em 0; }
.wysiwyg-root ul,
.wysiwyg-root ol { padding-left: 1.5em; margin: 0.25em 0; }
.wysiwyg-root blockquote {
  border-left: 3px solid var(--border);
  padding-left: 1em;
  opacity: 0.85;
  margin: 0.25em 0;
}
.wysiwyg-root pre {
  background: var(--accent-soft);
  border-radius: 6px;
  padding: 0.75em 1em;
  overflow-x: auto;
  font-size: 0.9em;
}
.wysiwyg-root code { font-family: ui-monospace, monospace; }
.wysiwyg-root table { border-collapse: collapse; margin: 0.5em 0; }
.wysiwyg-root th,
.wysiwyg-root td { border: 1px solid var(--border); padding: 0.25em 0.75em; }
.wysiwyg-root a { color: #0969da; text-decoration: underline; }
.wysiwyg-root .math { display: block; text-align: center; margin: 0.5em 0; overflow-x: auto; }
.wysiwyg-root pre.mermaid { background: var(--accent-soft); text-align: center; }

[data-typewriter='true'] .wysiwyg-root [data-bi] { opacity: 0.25; }
[data-typewriter='true'] .wysiwyg-root [data-bi][data-active-line] { opacity: 1; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/theme.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ThemeManager.tsx src/index.css tests/unit/theme.test.tsx
git commit -m "feat: add theme manager and editor styles"
```

---

### Task 11: App integration

**Files:**
- Modify: `src/types.ts` (add `Settings`, `EditorApi`, global `Window.api`)
- Modify: `src/App.tsx` (replace placeholder with full app)
- Test: `tests/unit/app.test.tsx`

**Interfaces:**
- Consumes: `WysiwygEditor`, `Toolbar`, `Sidebar`, `ThemeManager`, `window.api`.
- Produces: full app with file open/save, autosave (debounced), Ctrl+S, outline jump, theme switching, status bar.

- [ ] **Step 1: Extend `src/types.ts`**

```ts
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
}

export interface EditorApi {
  openFolder(): Promise<string | null>;
  listFiles(dir: string): Promise<FileNode[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string, content?: string): Promise<void>;
  renameFile(from: string, to: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  watchDir(dir: string): Promise<void>;
  onWatch(cb: (event: string, filename: string) => void): () => void;
  onOpenFile(cb: (path: string) => void): () => void;
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
```

- [ ] **Step 2: Write failing tests**

`tests/unit/app.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import App from '../../src/App';
import type { Settings } from '../../src/types';

function mockApi(files: Record<string, string>) {
  const state: Record<string, string> = { ...files };
  const api = {
    openFolder: vi.fn().mockResolvedValue('/r'),
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockImplementation((p: string) => Promise.resolve(state[p] ?? '')),
    writeFile: vi.fn().mockImplementation((p: string, c: string) => {
      state[p] = c;
    }),
    createFile: vi.fn().mockResolvedValue(undefined),
    renameFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    watchDir: vi.fn().mockResolvedValue(undefined),
    onWatch: vi.fn().mockReturnValue(() => {}),
    onOpenFile: vi.fn().mockReturnValue(() => {}),
    loadSettings: vi.fn().mockResolvedValue({
      theme: 'light',
      fontSize: 16,
      autosaveMs: 100
    } satisfies Settings),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    listThemes: vi.fn().mockResolvedValue([]),
    readTheme: vi.fn().mockRejectedValue(new Error('none'))
  };
  return { api, state };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('App', () => {
  it('loads a file via onOpenFile and autosaves after debounce', async () => {
    let openCb: ((p: string) => void) | null = null;
    const { api } = mockApi({ '/r/one.md': 'old' });
    api.onOpenFile = vi.fn().mockImplementation((cb: (p: string) => void) => {
      openCb = cb;
      return () => {};
    });
    window.api = api as unknown as typeof window.api;
    render(<App />);
    await act(async () => {});

    await act(async () => {
      openCb!('/r/one.md');
    });
    expect(screen.queryByText('No file open')).toBeNull();

    const box = screen.getByRole('textbox');
    fireEvent.beforeInput(box, { data: 'X', inputType: 'insertText' } as unknown as InputEvent);

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(api.writeFile).toHaveBeenCalledWith('/r/one.md', 'Xold');
  });

  it('ctrl+s saves immediately', async () => {
    let openCb: ((p: string) => void) | null = null;
    const { api } = mockApi({ '/r/two.md': 'hi' });
    api.onOpenFile = vi.fn().mockImplementation((cb: (p: string) => void) => {
      openCb = cb;
      return () => {};
    });
    window.api = api as unknown as typeof window.api;
    render(<App />);
    await act(async () => {});

    await act(async () => {
      openCb!('/r/two.md');
    });

    const box = screen.getByRole('textbox');
    fireEvent.beforeInput(box, { data: '!', inputType: 'insertText' } as unknown as InputEvent);

    await act(async () => {
      fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    });

    expect(api.writeFile).toHaveBeenCalledWith('/r/two.md', '!hi');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/app.test.tsx`
Expected: FAIL — placeholder App has no editor.

- [ ] **Step 4: Write the full `src/App.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import WysiwygEditor, { WysiwygEditorHandle } from './components/WysiwygEditor';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import ThemeManager from './components/ThemeManager';
import type { FileNode, Selection, Settings } from './types';

type SaveState = 'saved' | 'saving' | 'unsaved';

export default function App() {
  const [rootDir, setRootDir] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [settings, setSettings] = useState<Settings>({ theme: 'light', fontSize: 16, autosaveMs: 1000 });
  const [themeNames, setThemeNames] = useState<string[]>(['light', 'dark']);
  const [sidebarMode, setSidebarMode] = useState<'files' | 'outline'>('files');
  const [typewriter, setTypewriter] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const editorRef = useRef<WysiwygEditorHandle>(null);

  const refreshTree = useCallback(async (dir: string) => {
    setTree(await window.api.listFiles(dir));
  }, []);

  const openFile = useCallback(async (p: string) => {
    const text = await window.api.readFile(p);
    setCurrentPath(p);
    setContent(text);
    setSelection({ start: 0, end: 0 });
    setSaveState('saved');
  }, []);

  const openFolder = useCallback(async () => {
    const dir = await window.api.openFolder();
    if (!dir) return;
    setRootDir(dir);
    setSidebarMode('files');
    refreshTree(dir);
    window.api.watchDir(dir);
  }, [refreshTree]);

  const createFile = useCallback(async (p: string) => {
    await window.api.createFile(p);
    if (rootDir) refreshTree(rootDir);
  }, [rootDir, refreshTree]);

  const renameFile = useCallback(async (from: string, to: string) => {
    await window.api.renameFile(from, to);
    if (currentPath === from) setCurrentPath(to);
    if (rootDir) refreshTree(rootDir);
  }, [rootDir, currentPath, refreshTree]);

  const deleteFile = useCallback(async (p: string) => {
    await window.api.deleteFile(p);
    if (rootDir) refreshTree(rootDir);
  }, [rootDir, refreshTree]);

  useEffect(() => {
    const offWatch = window.api.onWatch(() => {
      if (rootDir) refreshTree(rootDir);
    });
    const offOpen = window.api.onOpenFile(openFile);
    window.api.loadSettings().then(setSettings);
    window.api.listThemes().then(ts => setThemeNames(['light', 'dark', ...ts]));
    return () => {
      offWatch();
      offOpen();
    };
  }, [rootDir, openFile, refreshTree]);

  useEffect(() => {
    if (!currentPath) return;
    setSaveState('unsaved');
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await window.api.writeFile(currentPath, content);
        setSaveState('saved');
      } catch {
        setSaveState('unsaved');
      }
    }, settings.autosaveMs);
    return () => clearTimeout(t);
  }, [content, currentPath, settings.autosaveMs]);

  const handleSave = useCallback(async () => {
    if (!currentPath) return;
    setSaveState('saving');
    try {
      await window.api.writeFile(currentPath, content);
      setSaveState('saved');
    } catch {
      setSaveState('unsaved');
    }
  }, [content, currentPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleSave]);

  const onChange = useCallback((c: string, s: Selection) => {
    setContent(c);
    setSelection(s);
  }, []);

  const wordCount = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          mode={sidebarMode}
          onToggle={() => setSidebarMode(m => (m === 'files' ? 'outline' : 'files'))}
          tree={tree}
          rootDir={rootDir}
          onOpenFile={openFile}
          onCreate={createFile}
          onRename={renameFile}
          onDelete={deleteFile}
          content={content}
          onJump={pos => setSelection({ start: pos, end: pos })}
          onOpenFolder={openFolder}
        />
        <div className="flex flex-1 flex-col">
          <Toolbar
            onAction={a => editorRef.current?.execute(a)}
            theme={settings.theme}
            themes={themeNames}
            onThemeChange={theme => setSettings(s => ({ ...s, theme }))}
            typewriter={typewriter}
            onToggleTypewriter={() => setTypewriter(t => !t)}
          />
          <div className="flex-1 overflow-auto px-10 py-6">
            <WysiwygEditor
              ref={editorRef}
              content={content}
              selection={selection}
              onChange={onChange}
              fontSize={settings.fontSize}
              typewriter={typewriter}
            />
          </div>
          <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-1 text-xs opacity-70">
            <span>{currentPath ?? 'No file open'}</span>
            <span>{saveState}</span>
            <span>{wordCount} words</span>
          </div>
        </div>
      </div>
      <ThemeManager theme={settings.theme} onThemeChange={theme => setSettings(s => ({ ...s, theme }))} />
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/app.test.tsx`
Expected: PASS (2 tests). Run `npx tsc --noEmit` (no errors).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/App.tsx tests/unit/app.test.tsx
git commit -m "feat: wire app with autosave, save shortcut and status bar"
```

---

### Task 12: E2E tests (Playwright + Electron)

**Files:**
- Create: `e2e/editor.spec.ts`
- Consumes: built app (`npm run build` produces `dist/` + `electron/dist/`), `--open <path>` flag from Task 3.

- [ ] **Step 1: Write the E2E spec**

`e2e/editor.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempDoc(initial: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-e2e-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, initial);
  return file;
}

test('opens a file and renders live preview', async () => {
  const file = tempDoc('# Title\n\nhello **world**');
  const app = electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  const box = win.locator('.wysiwyg-root');
  await expect(box.locator('h1')).toHaveText('Title');
  await expect(box.locator('strong')).toHaveText('world');

  await box.click();
  await win.keyboard.press('End');
  await win.keyboard.type(' more');
  await expect(box).toContainText('more');

  await app.close();
});

test('bold shortcut wraps the selection', async () => {
  const file = tempDoc('plain text');
  const app = electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('Control+a');
  await win.keyboard.press('Control+b');
  await expect(box.locator('strong')).toHaveText('plain text');

  await app.close();
});

test('outline lists headings and autosave writes to disk', async () => {
  const file = tempDoc('# One\n\nbody\n\n## Two');
  const app = electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  await win.getByRole('button', { name: 'Outline' }).click();
  await expect(win.getByRole('button', { name: 'One' })).toBeVisible();
  await expect(win.getByRole('button', { name: 'Two' })).toBeVisible();

  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('Control+End');
  await win.keyboard.type(' saved');

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toContain('saved');

  await app.close();
});
```

- [ ] **Step 2: Build and run**

```bash
npm run e2e
```
Expected: 3 E2E tests pass. If a test is flaky on `Control+a` selection sync, verify the `selectionchange` listener in `WysiwygEditor.tsx` (Task 7) and fix it before moving on.

- [ ] **Step 3: Commit**

```bash
git add e2e/editor.spec.ts
git commit -m "test: add Playwright E2E coverage for editor"
```

---

### Task 13: Packaging and final verification

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1: Write `electron-builder.yml`**

```yaml
appId: com.local.mdeditor
productName: MD Editor
directories:
  output: dist_electron
files:
  - dist/**
  - electron/dist/**
linux:
  target:
    - dir
```

- [ ] **Step 2: Final full verification**

```bash
npx tsc --noEmit
npm test            # expected: all unit + integration tests pass
npm run e2e         # expected: 3 E2E tests pass
npm run dist        # expected: dist_electron/linux-unpacked/MD Editor exists
```

- [ ] **Step 3: Manual smoke (optional but recommended)**

```bash
npx electron . --dev
```
Expected: window opens with Vite dev server; open a folder, type, see live preview, autosave.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml
git commit -m "build: add electron-builder packaging config"
```

---

## Self-Review Notes

- Spec coverage: cleanup (T1), stack (T1), main-process modules (T2–T3), editor model + actions (T4), rendering + mapping (T5), cursor (T6), editor component + shortcuts + typewriter + composition + mermaid fallback (T7), toolbar (T8), sidebar/explorer/outline + file CRUD (T9), themes + CSS (T10), app wiring + autosave + Ctrl+S + status bar (T11), E2E (T12), packaging (T13).
- Math: single-line `$$…$$` in its own paragraph (KaTeX, display mode); multi-line display math is a non-goal, matching the spec.
- Known approximation: cursor mapping inside a rendered run is linear interpolation between `data-s`/`data-e`; gaps (markers, block symbols) snap to the nearest run boundary. Acceptable per spec fallback rules.
