# Changelog

Version numbers are the build date: `ÅÅÅÅ.M.D`.

## 2026.10.1

### Features

### Fixes
- **Windows code-block editing** — fenced code blocks in CRLF documents now
  retain exact source offsets on every line, keeping the caret stable while
  editing and navigating with arrow keys, including syntax-highlighted code.
- **Leaving code blocks with Left Arrow** — the caret now returns to the end
  of the preceding text instead of jumping to the top of the document.
- **Entering code blocks with Right Arrow** — the caret now enters at the
  first editable code character instead of jumping to the document start.

## 2026.9.30

### Features
- **Help → About dialog** — app name, version and the full changelog in a
  menu dialog. The changelog ships inside the app (package.json `files`) so
  it stays current with every release.
- **Windows build** — `npm run dist:win` produces an unpacked, unsigned
  Windows app in `release/win-unpacked` with `MDKnas.ico`.

### Fixes
- **Outline jump on CRLF files** — the raw-MD caret drifted right (one
  character per preceding CRLF line) after jumping to a heading, because a
  textarea normalizes CRLF to LF. The selection offset now compensates for
  the '\r' characters.

## 2026.9.22

### Features
- **Table context menu** — right-click a table cell to add or delete rows and
  columns. The caret lands in the affected cell. Invalid operations
  (e.g. deleting the header row or the last column) are disabled.
- **Remember last open folder** — the app reopens the folder that was open
  last time it was closed (silently skipped if the folder no longer exists).

### Fixes
- **Blockquote empty line** — quotes rendered with a large empty space at the
  top (the caret sat on a phantom blank line above the text). The leading
  gap is now emitted inside the `<p>`, so text starts at the top of the quote.
- **Blockquote margins** — removed extra vertical space inside blockquotes
  (first/last block no longer adds its own margin).

## 2026.9.16 — initial release (v0.1.0)

WYSIWYG markdown editor (Electron): live markdown rendering with caret
mapping back to the source, toolbar formatting, tables, task lists, code
blocks with copy button, image drag & drop into an assets folder, dark/light
theme, typewriter mode, auto-save, and external-edit reload.
