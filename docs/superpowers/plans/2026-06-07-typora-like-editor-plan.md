# Typora-like Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Linux desktop Markdown editor using Tauri that provides a WYSIWYG "What You See Is What You Mean" editing experience similar to Typora.

**Architecture:** A Tauri application with a React frontend. It will use a custom rendering pipeline where raw Markdown is parsed into an AST and mapped to React components for live preview. A dual-purpose sidebar will handle file management and document outlines.

**Tech Stack:** Tauri (Rust), React, TypeScript, Tailwind CSS, markdown-it.

---

### Task 1: Project Scaffolding & Tauri Setup

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/main.rs`
- Create: `src/index.html`
- Create: `src/App.tsx`
- Create: `src/main.tsx`
- Create: `src/App.css`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`

- [ ] **Step 1: Initialize Tauri project structure**

```json
{
  "name": "typora-clone",
  "version": "0.1.0",
  "main": "index.html",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "markdown-it": "^13.0.0",
    "lucide-react": "^0.263.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  },
  "devDependencies": {
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@tauri/cli": "^1.5.0"
  }
}
```

- [ ] **Step 2: Configure Tailwind CSS**

Run: `npx tailwindcss init -p`

- [ ] **Step 3: Configure TSConfig**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Node",
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Implement basic Tauri window with React root**

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: initial project scaffolding"
```

### Task 2: Markdown Parsing Logic

**Files:**
- Create: `src/lib/markdown.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Setup markdown-it instance**

```typescript
import MarkdownIt from 'markdown-it';

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

export function parseMarkdown(content: string): string {
  return md.render(content);
}
```

- [ ] **Step 2: Integrate parser into App.tsx**

```tsx
import { useState } from 'react';
import { parseMarkdown } from './lib/markdown';

function App() {
  const [content, setContent] = useState('# Hello World');
  
  return (
    <div className="flex h-screen">
      <textarea 
        className="w-2/3 p-4 border-r"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div 
        className="w-1/3 p-4"
        dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/markdown.ts src/App.tsx
git commit -m "feat: add basic markdown parsing"
```

### Task 3: WYSIWYG Live Preview & Editor Component

**Files:**
- Create: `src/components/Editor.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create Editor component with live preview**

```tsx
import React, { useState, useEffect } from 'react';
import { parseMarkdown } from '../lib/markdown';

export const Editor = () => {
  const [raw, setRaw] = useState('');
  const [html, setHtml] = useState('');

  useEffect(() => {
    setHtml(parseMarkdown(raw));
  }, [raw]);

  return (
    <div className="flex flex-col h-full">
      <textarea
        className="flex-1 p-4 font-mono text-sm outline-none resize-none"
        placeholder="Type markdown here..."
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <div 
        className="flex-1 p-4 prose max-w-none overflow-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Editor.tsx
git commit -m "feat: implement WYSIWYG editor component"
```

### Task 4: Sidebar with File Management & Outline Toggle

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/FileExplorer.tsx`
- Create: `src/components/OutlineView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement FileExplorer component**

- [ ] **Step 2: Implement OutlineView component**

- [ ] **Step 3: Create Sidebar with toggle**

```tsx
import React, { useState } from 'react';
import FileExplorer from './FileExplorer';
import OutlineView from './OutlineView';

export const Sidebar = () => {
  const [activeView, setActiveView] = useState<'files' | 'outline'>('files');

  return (
    <div className="w-64 h-full border-r flex flex-col">
      <div className="flex p-2 border-b">
        <button 
          className={`flex-1 p-1 ${activeView === 'files' ? 'bg-gray-200' : ''}`}
          onClick={() => setActiveView('files')}
        >Files</button>
        <button 
          className={`flex-1 p-1 ${activeView === 'outline' ? 'bg-gray-200' : ''}`}
          onClick={() => setActiveView('outline')}
        >Outline</button>
      </div>
      <div className="flex-1 overflow-auto">
        {activeView === 'files' ? <FileExplorer /> : <OutlineView />}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx src/components/FileExplorer.tsx src/components/OutlineView.tsx
git commit -m "feat: add dual-purpose sidebar with toggle"
```

### Task 5: Styling & Themes

**Files:**
- Modify: `src/App.css`
- Create: `src/themes/default.css`
- Create: `src/themes/dark.css`

- [ ] **Step 1: Setup global styles and typography**

- [ ] **Step 2: Implement theme switching logic**

- [ ] **Step 3: Commit**

```bash
git add src/App.css src/themes/*.css
git commit -m "style: add theme support"
```

### Task 6: Advanced Features (Math, Diagrams, Auto-Pairing)

**Files:**
- Modify: `src/lib/markdown.ts`
- Create: `src/components/MathJax.tsx`
- Create: `src/components/Mermaid.tsx`

- [ ] **Step 1: Integrate MathJax for equations**

- [ ] **Step 2: Integrate Mermaid for diagrams**

- [ ] **Step 3: Implement Auto-Pairing logic**

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add math, diagrams, and auto-pairing"
```

### Task 7: Final Polish & Deployment

**Files:**
- Modify: `src-tauri/src/main.rs`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement Typewriter Mode**

- [ ] **Step 2: Final bug fixes and UI polish**

- [ ] **Step 3: Build and release**

```bash
tauri build
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: final polish and build"
```
