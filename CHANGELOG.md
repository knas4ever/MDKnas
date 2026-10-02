# Changelog

Version numbers are the build date: `ÅÅÅÅ.M.D`.

## 2026.10.2

### Features

### Fixes
- **Up/Down in wrapped list items** — a long item that wraps over several
  lines is now stepped through one visual line per press; only the item's
  first/last line crosses to the neighbouring item, instead of every press
  jumping to the next item. Entering a wrapped item lands on the line it
  actually shows (the last one when moving up) at the caret's column,
  instead of the item's first character.
- **Stepping out of styled text** — one Right (or Left on the other side) now
  passes the whole emphasis marker: after bolding a selection, a single Right
  leaves `**word**`, and with bold+italic it leaves `***word***` too, instead
  of one press per marker character. Code keeps its literal characters, so
  arrow keys inside code blocks still move one character at a time.
- **Stacking styles** — pressing Italic on text that is already bold (or Bold
  on italic text) now nests the new style instead of stripping one character
  of the existing marker: `**word**` + Italic gives `***word***`, and pressing
  the same style a second time still removes it. This also covers the caret
  inside a fresh empty pair.
- **Raw markdown mode formatting** — Bold/Italic/etc. from the toolbar or the
  Format menu now act on the text you selected in the raw source view (the
  textarea's selection was ignored, so markers landed at the document start),
  and the caret is re-placed inside the new markers afterwards instead of the
  editor losing focus when the toolbar button was clicked. CRLF documents
  keep their exact source offsets.
- **Up/Down inside bold-led lists** — moving the caret up/down between list
  items that start with bold, code or links no longer clips to the end of the
  leading markup. The column is measured from the left edge of the visual
  line the caret sits on and every text span on the target line is a
  candidate, so the caret lands at the same visual position on the
  neighbouring line.

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
- **Opening files from Explorer** — launching MDKnas through a `.md` file
  association now opens the clicked file instead of restoring only the last
  folder.
- **Vertical movement across lists** — moving between headings and indented
  list or task text with Up/Down now preserves the caret column, including
  items that begin with inline code.

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
