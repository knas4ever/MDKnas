# Design Specification: WYSIWYG Markdown Editor (Electron) — From-Scratch Rebuild

## Overview

A desktop "What You See Is What You Mean" (WYSIWYG) Markdown editor for Linux, rebuilt from scratch. It replaces the previous Tauri implementation. A single `contenteditable` surface renders Markdown as rich text in place — syntax symbols disappear as you type, replaced by live formatting (Typora-style).

Requirements are carried over from the two 2026-06-07 specs (`typora-like-editor-design.md`, `wysiwyg-editor-design.md`); this document restates the full scope with the new stack.

## Cleanup

The old implementation and all build artifacts are deleted before scaffolding:

- `src-tauri/` (including `target/`, `gen/`, `Cargo.lock`, icons)
- `src/` (old renderer), `src/dist`
- `tauri.conf.json`, `postcss.config.js`, `tailwind.config.js`, `tsconfig.json`, `vite.config.ts`, `package.json`, `package-lock.json`, `node_modules/`

Kept: `docs/superpowers/` (specs and plan, as requirements reference and history).

## Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Desktop shell | Electron | Node main process + Chromium renderer; no system packages needed |
| Frontend | React 18 + TypeScript | Bundled with Vite |
| Markdown parser | markdown-it | Custom renderers |
| Main-process build | esbuild | Compiles `electron/*.ts` for Node |
| Code highlighting | highlight.js | Applied to fenced blocks |
| Math | KaTeX | Display math `$$…$$`; chosen over MathJax for speed and sync rendering |
| Diagrams | Mermaid | Covers flowcharts; Flowchart.js is deprecated (non-goal) |
| Styling | Tailwind CSS + custom CSS themes | Themes via CSS variables |
| Packaging | electron-builder | Produces distributable Linux build |
| Testing | Vitest (unit/integration), Playwright (E2E) | |

## Architecture

### Main process (Node)

- `electron/main.ts` — app lifecycle, window creation (single window, dark/light titlebar aware).
- `electron/fileService.ts` — pure fs module (no Electron imports, unit-testable):
  - `listFiles(dir)` — recursive file tree, directories first, depth limit 5, ignores `node_modules`/`.git`
  - `readFile(path)`, `writeFile(path, content)` — UTF-8
  - `watchDir(dir, cb)` — `fs.watch` with debounce; emits added/removed/changed
- `electron/settingsService.ts` — loads/saves `settings.json` in `app.getPath('userData')` (theme, font size, auto-save interval).
- `electron/ipc.ts` — registers IPC handlers wrapping the above; dialog for "Open Folder".
- `electron/preload.ts` — `contextBridge` exposes a typed `window.api` (files, settings, watch events, dialog).

Security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.

### Renderer (React)

```
src/
  main.tsx
  App.tsx                  # layout: sidebar + editor + status bar; app state
  components/
    WysiwygEditor.tsx      # contenteditable surface, input handling, cursor preservation
    Toolbar.tsx            # format buttons + keyboard shortcut wiring
    Sidebar.tsx            # toggle between file explorer and outline
    FileExplorer.tsx       # folder tree, open/new/save
    OutlineView.tsx        # headings of current document (from raw source)
    ThemeManager.tsx       # apply built-in or user CSS themes via CSS variables
  lib/
    markdown.ts            # markdown-it pipeline with custom renderers
    cursor.ts              # saveCursor() / restoreCursor() + fallback
    editorActions.ts       # pure text-editing ops applied to the raw source (insert, delete, wrap, indent, auto-pair)
  themes/                  # light.css, dark.css, user theme files
```

### Core model (source of truth)

The **raw Markdown string is the single source of truth** — the DOM is a display surface, not the model.

1. Keystrokes and input events are translated into edits on the raw string (`editorActions.ts`): plain text insert/delete, auto-pairing of `**`, quotes, brackets, Tab/Shift+Tab indentation, shortcut-driven wrapping (bold, italic, headings, lists, blockquote, link, inline code).
2. On each edit: `saveCursor()` (DOM selection → source offsets) → re-render `content` via `markdown.ts` → set `innerHTML` → `restoreCursor()` (source offsets → DOM selection).
3. No DOM→Markdown reverse serialization is needed, which keeps the pipeline simple and round-trip safe.

### Cursor preservation (`lib/cursor.ts`)

1. **Before re-render**: record selection start/end as character offsets in the raw source (mapped from the DOM selection using `data-*` attributes the renderers embed per text run).
2. **After re-render**: walk the new DOM to the same offsets and set the selection.
3. **Edge cases**: empty lines, inline elements, block boundaries, selection across blocks.
4. **Fallback**: if mapping fails, place the cursor at end of content and log a warning.

### Markdown element support

| Element | Rendering | Notes |
|---|---|---|
| Headings `# … ######` | `<h1-6 data-level>` | Powers outline view |
| Bold `**text**` | `<strong>` | |
| Italic `*text*` | `<em>` | |
| Inline code `` `text` `` | `<code>` | |
| Strikethrough `~~text~~` | `<del>` | |
| Links `[text](url)` | `<a href>` | URL part is contenteditable; edits write back to source |
| Bullet lists `- item` | `<ul><li>` | Nested via indentation |
| Numbered lists `1. item` | `<ol><li>` | |
| Blockquotes `> text` | `<blockquote>` | |
| Fenced code ` ```lang ` | `<pre><code class="language-x">` | highlight.js |
| Tables | `<table><thead><tbody>` | Editable cells |
| Math `$$…$$` | KaTeX `<span class="math">` | Display math only |
| Mermaid ` ```mermaid ` | `<div class="mermaid">` | Rendered by Mermaid |

### Sidebar

Single sidebar with a toggle (two modes, per the original spec):

- **File Explorer**: tree of the open folder (via IPC); open file loads into editor; create/rename/delete file; directory watch refreshes the tree.
- **Outline**: heading list of the *current document*, extracted from the raw Markdown source (not the DOM); click jumps the cursor to that heading.

### Themes (`ThemeManager.tsx`)

- Built-in: `light`, `dark`.
- Custom: `.css` files in `<userData>/themes/` (created on first launch), discovered at startup; each file is one theme. Applied by setting CSS variables on the root; active theme persisted in settings.

### Auto-save & file ops

- Debounced write (default 1 s) on content change via IPC `write-file`; explicit save (Ctrl+S).
- `watch-dir` events update the file explorer; external change of the open file prompts reload.

### UI/UX

- Distraction-free: clean paper-like editing surface, minimal chrome.
- Typewriter mode (toggle): dims all lines except the current line.
- Auto-pairing: brackets, quotes, and Markdown symbols (`**`, `` ` ``, etc.) auto-close; typing the closing symbol over a paired one skips it.
- Status bar: file path, save state (saved / saving / unsaved), word count.

## Data Flow

```
Keystroke / input
      ↓
editorActions: edit raw markdown string + new cursor offsets
      ↓
saveCursor()            (DOM selection → source offsets)
      ↓
markdown.ts: parse with markdown-it → render HTML with data-* mapping attrs
      ↓
contenteditable.innerHTML = html
      ↓
restoreCursor()         (source offsets → DOM selection)
      ↓
debounced IPC write-file (auto-save)
      ↓
watch-dir events → FileExplorer refresh
outline re-extracted from raw source
```

## Error Handling

| Failure | Behavior |
|---|---|
| Markdown parse error | Show raw text, highlight the error position |
| Render error (e.g. malformed mermaid) | Fallback: escaped HTML for that block; rest of document renders |
| Cursor restore failure | Log warning, place cursor at end of content |
| File write failure | Status bar shows "unsaved — write error"; no data loss (source string in memory) |
| IPC failure | Toast in status bar; retry on next save |

## Testing Plan

- **Unit (Vitest)**:
  - `markdown.ts`: each renderer produces expected HTML (headings, lists, tables, math, mermaid, code)
  - `cursor.ts`: save/restore round-trip on known documents, edge cases (empty doc, end of block, inline elements)
  - `editorActions.ts`: insert/delete, auto-pairing, wrapping, indent/outdent
- **Integration (Vitest + Node fs, no Electron)**:
  - `fileService.ts` / `settingsService.ts`: read/write round-trip, settings persistence, watch events (temp dirs)
- **E2E (Playwright, Electron)**:
  - Launch app, open a sample document, type, verify live preview updates
  - Keyboard shortcuts (bold, heading, list)
  - Outline navigation, file open/save, theme switch

## Non-Goals

- Multi-file / split editing, git integration, spellcheck
- Flowchart.js (Mermaid covers diagrams)
- Inline `$…$` math (display `$$…$$` only)
- Sync/cloud storage, mobile support
