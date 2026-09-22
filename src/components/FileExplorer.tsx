import { useState } from 'react';
import type { FileNode } from '../types';

interface Props {
  tree: FileNode[];
  rootDir: string | null;
  currentPath: string | null;
  onOpenFile(path: string): void;
  onCreate(path: string): void;
  onRename(from: string, to: string): void;
  onDelete(path: string): void;
  ask(message: string, defaultValue: string): Promise<string | null>;
}

// Folders are shown when they contain at least one .md file somewhere
// below them.
function hasMd(node: FileNode): boolean {
  if (node.isDir) return (node.children ?? []).some(c => hasMd(c));
  return node.name.toLowerCase().endsWith('.md');
}

export default function FileExplorer({
  tree,
  rootDir,
  currentPath,
  onOpenFile,
  onCreate,
  onRename,
  onDelete,
  ask
}: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (!rootDir) {
    return (
      <div className="p-3 text-sm opacity-60">
        No folder open.
        <br />
        Use <b>File ▸ Open Folder…</b> to browse markdown files.
      </div>
    );
  }

  const toggle = (path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const menuActions = (path: string, dir: string) => {
    const name = path.slice(path.lastIndexOf('/') + 1);
    return (
      <div className="flex gap-1 text-xs py-1 px-2">
        <button
          className="rounded border border-[var(--border)] px-1"
          onClick={() => {
            void ask('New file name (in the current folder)', 'new.md').then(n => {
              if (n) onCreate(dir + '/' + n);
              setMenuFor(null);
            });
          }}
        >
          New
        </button>
        <button
          className="rounded border border-[var(--border)] px-1"
          onClick={() => {
            void ask('New name', name).then(n => {
              if (n) onRename(path, dir + '/' + n);
              setMenuFor(null);
            });
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

  const renderNodes = (nodes: FileNode[], depth: number): JSX.Element[] =>
    nodes.flatMap(n => {
      if (n.isDir) {
        if (!hasMd(n)) return [];
        const isCollapsed = collapsed.has(n.path);
        return [
          <div key={n.path} className="flex items-center gap-1">
            <button
              onClick={() => toggle(n.path)}
              className="flex-1 text-left"
              style={{ paddingLeft: depth * 14 }}
            >
              {isCollapsed ? '▸' : '▾'} {n.name}/
            </button>
            <button
              title="Folder actions"
              onClick={() => setMenuFor(menuFor === n.path ? null : n.path)}
              className="px-1"
            >
              ⋮
            </button>
            {menuFor === n.path && menuActions(n.path, n.path)}
          </div>,
          ...(isCollapsed ? [] : renderNodes(n.children ?? [], depth + 1))
        ];
      }
      if (!n.name.toLowerCase().endsWith('.md')) return [];
      const dir = n.path.slice(0, n.path.lastIndexOf('/'));
      return [
        <div key={n.path} className="flex items-center gap-1">
          <button
            onClick={() => onOpenFile(n.path)}
            className={`flex-1 text-left ${currentPath === n.path ? 'font-semibold' : ''}`}
            style={{ paddingLeft: depth * 14 }}
          >
            {n.name}
          </button>
          <button
            title="File actions"
            onClick={() => setMenuFor(menuFor === n.path ? null : n.path)}
            className="px-1"
          >
            ⋮
          </button>
          {menuFor === n.path && menuActions(n.path, dir)}
        </div>
      ];
    });

  return (
    <div className="flex-1 overflow-auto p-2 text-sm">
      {renderNodes(tree, 0)}
      {tree.every(n => !hasMd(n)) && (
        <div className="opacity-60">No .md files in this folder.</div>
      )}
    </div>
  );
}
