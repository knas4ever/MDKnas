# Changelog

Version numbers are the build date: `ÅÅÅÅ.M.D`.

## 2026.10.3

### Features
- **Drawn caret** — the editor now draws the cursor: a 2px bar in the accent
  colour, a little taller than the line's font, blinking on the browser's
  cadence. The native caret is 1px and hard to spot (and paints nothing at
  all inside the zero-width source-coverage spans), so its colour is
  switched to transparent while the drawn bar is on screen and restored
  whenever there is no caret to draw (a range selection).
- **File-row pop-up menu** — the ⋮ actions in the folder tree no longer sit
  inline in the row, where the 240px sidebar could not fit them: they open a
  floating menu beside the sidebar, clamped to the window, with the usual
  click-away layer and Escape to close it.

### Fixes
- **Caret invisible at a line start** — the cursor vanished at the first
  position of a heading, a list item or a table cell. Those lines start with
  a zero-width source-coverage span (the stripped `## `, `- `, `1. ` marker
  or the cell's pipes), and an arrow press from the first visible character
  parked the caret inside it. The spans still keep `line-height: 0` so a
  leaked one cannot open a phantom line box, but they no longer collapse to
  `font-size: 0`: the browser paints the caret as tall as the font at the
  caret's position, so it now shows at the correct x with the line's height.
- **Typing in front of hidden markup** — with the caret visible it became
  possible to step left of a heading's `#`, a list marker or a table cell's
  pipes and type there, producing `X# Heading`, `X- item` or `X| cell |` and
  destroying the block. A caret at the first visible character of such a
  line no longer steps into the markup: headings, list items and quotes
  cross straight to the end of the previous block's text (the blank line's
  end is indistinguishable from the start of the markup), and a table cell
  keeps its place, since the caret cannot leave a cell sideways.
- **Nested quote markers** — a nested quote line (`> > deep`) only anchored
  the outer `> ` as hidden markup, so the caret and typing landed in front
  of the inner one. One `> ` per open quote level is now covered.
- **Header cells as line units** — `th` cells were not recognised as a
  caret's line unit, so arrow navigation treated them as plain text and
  could leave the cell; they now behave exactly like `td` cells.
- **Table navigation** — arrow keys inside a table moved to the neighbouring
  cell in the DOM, which for up/down is the previous/next cell of the same
  row, and left/right at a cell edge escaped the table. They now follow the
  grid: up/down stay in the same column and change row, left/right step
  through the cells in reading order, and at the table's first/last cell the
  caret leaves the table to the text before/after it.
- **Caret scrolls out of view** — walking down a document taller than the
  window pushed the caret below the visible area: a programmatic caret
  placement (`addRange`) does not scroll the container the way a native
  caret move or typing does, so the cursor looked like it had left focus,
  and only a left/right press snapped it back. The caret's line is now
  scrolled into view after every caret placement.
- **Long names in the folder tree** — a file or folder name wider than the
  sidebar could not shrink (a flex item's default `min-width: auto` is its
  min-content width), so the row overflowed the sidebar's own scroll box and
  pushed the ⋮ actions out of view. The name now shrinks and ellipsizes
  (`min-w-0 truncate`), which keeps the row inside the sidebar.

## 2026.10.2

### Features
- **Resize an image** — right-click an image and type a percentage: the
  markdown gains a pandoc-style size attribute (`![alt](pic.png){width=40%}`),
  the rich view shows the image at that width, and the attribute stays hidden
  inside the image's clickable unit. Typing 100 removes the attribute again,
  and Backspace/Delete still remove the whole image including its size.
- **Text column left-aligned** — the editor column used to be centred, which
  left dead space on both sides and a `max-width: 100%` cap clamped every
  image to the column, so resizing above 100% did nothing visible. The column
  now sits flush left and a sized image may grow into the free window width
  to the right.

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
