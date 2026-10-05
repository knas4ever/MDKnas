# MDKnas

MDKnas is a desktop WYSIWYG Markdown editor built with Electron, React, and
Vite. It keeps Markdown as the source of truth while providing a rich editing
experience for common document structures.

## Features

- Rich editing for headings, emphasis, inline and fenced code, links, quotes,
  lists, task lists, and tables
- Toggleable raw Markdown source view
- File explorer and document outline, with folder watching and remembered last
  folder
- Autosave, undo/redo, and external-file-change detection
- Light, dark, and custom themes
- Syntax highlighting, KaTeX math, Mermaid diagrams, and image resizing
- Paste or drag images into a document's `_assets` folder

## Getting started

Prerequisites:

- Node.js 20 or later
- npm

Install dependencies and start the development app:

```bash
npm install
npm run dev
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite with Electron in development mode |
| `npm run build` | Build the renderer and Electron main process |
| `npm test` | Run Vitest unit tests |
| `npm run lint` | Type-check the renderer |
| `npm run typecheck:main` | Type-check the Electron main process |
| `npm run e2e` | Build and run the Playwright end-to-end tests |
| `npm run dist` | Build Linux AppImage and Debian packages |
| `npm run dist:win` | Build an unpacked, unsigned Windows application in `release\win-unpacked` |

## Project structure

```text
src/                 React renderer and editor implementation
src/lib/             Markdown rendering, cursor mapping, and text actions
electron/            Electron main process, preload bridge, and IPC handlers
tests/unit/          Vitest unit tests
e2e/                 Playwright Electron tests
build/               Application icons
```

The Markdown string and its selection are the editor's source of truth. Rich
editing is rendered from that string; editor actions produce updated Markdown
and a new selection rather than mutating document content in the DOM.

## Releases

Version numbers use the build date format `YYYY.M.D`. For a release, update
`version` in `package.json` and add matching `Features` and `Fixes` sections
to `CHANGELOG.md`, then build the desired platform package:

```bash
# Linux
npm run dist

# Windows
npm run dist:win
```

`CHANGELOG.md` is bundled with the application and displayed in **Help →
About**.

## License

[MIT](LICENSE)
