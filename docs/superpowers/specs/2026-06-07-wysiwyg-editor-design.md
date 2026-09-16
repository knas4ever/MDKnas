# Design Specification: Typora-like WYSIWYG Markdown Editor

## Overview
Replace the current split-view editor (textarea + preview) with a single contenteditable WYSIWYG editor that renders markdown as rich text in-place, similar to Typora.

## Architecture

### Core Approach: Contenteditable + Full Re-render
- Single `<div contenteditable>` as the editing surface
- On each input: parse full content as markdown → render to HTML → replace contenteditable innerHTML
- Restore cursor position using Selection/Range API
- Use existing `markdown-it` pipeline with custom renderers

### Components

1. **WysiwygEditor.tsx** - Main editor component
   - Manages contenteditable div
   - Handles input events, cursor preservation
   - Coordinates markdown parsing and rendering

2. **markdown.ts** (enhanced) - Parsing pipeline
   - Custom renderers for: headings, lists, code blocks, tables, math, mermaid
   - Inline renderers for: bold, italic, code, links, strikethrough
   - Produces HTML with data attributes for cursor mapping

3. **cursor.ts** - Cursor management utilities
   - `saveCursor()` - Capture selection before re-render
   - `restoreCursor()` - Restore selection after re-render
   - Handle edge cases: empty lines, inline elements, block boundaries

4. **Toolbar.tsx** (optional) - Formatting toolbar
   - Buttons for bold, italic, headings, lists, code, links
   - Keyboard shortcuts (Cmd+B, Cmd+I, etc.)

## Data Flow

```
User Input
    ↓
saveCursor() → Selection + offset mapping
    ↓
Parse raw text as markdown (markdown-it)
    ↓
Render to HTML with cursor markers
    ↓
contenteditable.innerHTML = html
    ↓
restoreCursor() → map offsets to new DOM positions
```

## Markdown Element Support

| Element | Rendering | Notes |
|---------|-----------|-------|
| Headings (# ## ###) | `<h1-6>` with `data-level` | Preserve heading level for outline |
| Bold (**text**) | `<strong>` | |
| Italic (*text*) | `<em>` | |
| Code (`text`) | `<code>` | Inline only |
| Strikethrough (~~text~~) | `<del>` | |
| Links ([text](url)) | `<a href>` | Click to edit |
| Lists (- item) | `<ul><li>` | Nested via indentation |
| Numbered lists (1. item) | `<ol><li>` | |
| Blockquotes (> text) | `<blockquote>` | |
| Code blocks (```lang) | `<pre><code class="language-x">` | Syntax highlight via CSS |
| Tables | `<table><thead><tbody>` | contenteditable in cells |
| Math ($$...$$) | `<span class="math">` | Render via MathJax |
| Mermaid (```mermaid) | `<div class="mermaid">` | Render via Mermaid |

## Cursor Preservation Strategy

1. **Before re-render**: Walk DOM from start to selection anchor, count text nodes/offsets
2. **After re-render**: Walk new DOM to same position, set selection
3. **Fallback**: If mapping fails, place cursor at end of content

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+B | Bold |
| Cmd/Ctrl+I | Italic |
| Cmd/Ctrl+K | Insert link |
| Cmd/Ctrl+` | Inline code |
| Cmd/Ctrl+Shift+1/2/3 | Heading 1/2/3 |
| Cmd/Ctrl+Shift+L | Bullet list |
| Cmd/Ctrl+Shift+7 | Numbered list |
| Cmd/Ctrl+Shift+Q | Blockquote |
| Tab/Shift+Tab | Indent/outdent list items |

## Integration Points

- **File operations**: Use existing Tauri commands (read_file, write_file)
- **Outline**: Extract headings from markdown source (not DOM)
- **Auto-save**: Debounced write to file on content change
- **Themes**: Apply via CSS variables to contenteditable

## Error Handling

- Parse errors: Show raw text, highlight error position
- Render errors: Fallback to escaped HTML
- Cursor restore failure: Log warning, place at end

## Testing

- Unit: markdown parsing, cursor save/restore
- Integration: Full edit cycle, file save/load
- E2E: Keyboard shortcuts, complex documents