# Design Specification: Typora-like Markdown Editor (Tauri)

## Overview
A desktop Markdown editor for Linux that provides a "What You See Is What You Mean" (WYSIWYG) experience, similar to Typora. It focuses on a seamless live preview where Markdown syntax symbols disappear as you type, replaced by rich formatting.

## Tech Stack
- **Framework:** Tauri (Rust backend, Web frontend)
- **Frontend:** React, TypeScript, Tailwind CSS
- **Markdown Parser:** markdown-it
- **Styling:** Custom CSS themes

## Core Features
- **Live Preview:** Real-time rendering of Markdown as it is typed.
- **File Management:** Sidebar for browsing local files and folders.
- **Outline View:** Dynamic navigation of document headers.
- **Themes:** Support for custom CSS themes.
- **Syntax Highlighting:** Support for various programming languages in code fences.
- **Math Support:** Integration with MathJax/KaTeX.
- **Diagrams:** Support for Mermaid.js and Flowchart.js.

## Architecture
### Frontend
- `Editor.tsx`: The main editing component handling user input and the live preview logic.
- `FileExplorer.tsx`: Sidebar for managing files.
- `Outline.tsx`: Sidebar for document navigation.
- `ThemeManager.tsx`: Logic for switching and loading CSS themes.

### Backend (Tauri/Rust)
- `file_handler.rs`: Native commands for reading/writing files and folder watching.
- `settings.rs`: Persistence for user configuration (theme, font size, etc.).

## Data Flow
1. **Input:** User types in a controlled React component.
2. **Parsing:** `markdown-it` parses the raw string into an AST.
3. **Rendering:** A custom renderer maps the AST to React components.
4. **Persistence:** A debounced effect calls a Tauri command to write the raw string to the file system.

## UI/UX
- **Distraction Free:** The editor should feel like a clean sheet of paper.
- **Typewriter Mode:** Optional focus on the current line.
- **Auto-Pairing:** Automatic closing of brackets, quotes, and Markdown symbols (e.g., `**`).

## Testing Plan
- Unit tests for the Markdown parser and custom renderer.
- Integration tests for file saving and loading.
- E2E tests using Playwright to verify the live preview behavior.
