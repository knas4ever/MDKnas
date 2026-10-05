import { useEffect, useState } from 'react';
import type { FileNode } from '../types';
import { basename, dirname } from '../lib/path';

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

// Rough size of the pop-up menu; it is only used to keep the menu inside
// the window when the row sits near an edge.
const MENU_W = 112;
const MENU_H = 148;

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
  // The row's ⋮ button opens a pop-up menu beside the sidebar rather than
  // inline: the sidebar is only 240px wide, so an inline row of actions is
  // clipped by the tree's own scroll box and a long file name pushes the
  // actions out of view.
  const [menu, setMenu] = useState<
    {
      path: string;
      createDir: string;
      renameDir: string;
      name: string;
      isDir: boolean;
      x: number;
      y: number;
    } | null
  >(null);
  // Folders start collapsed when a folder is opened; the toggle
  // remembers the user's expansions.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    setExpanded(new Set());
  }, [rootDir]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

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
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // The menu pops out to the right of the ⋮ button, in the editor's space,
  // where the whole window width is available.
  const openMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    path: string,
    createDir: string,
    renameDir: string,
    isDir: boolean
  ): void => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({
      path,
      createDir,
      renameDir,
      name: basename(path),
      isDir,
      x: Math.max(4, Math.min(r.right + 6, window.innerWidth - MENU_W - 4)),
      y: Math.max(4, Math.min(r.top, window.innerHeight - MENU_H - 4))
    });
  };

  const renderNodes = (nodes: FileNode[], depth: number): JSX.Element[] =>
    nodes.flatMap(n => {
      if (n.isDir) {
        if (!hasMd(n)) return [];
        const isExpanded = expanded.has(n.path);
        return [
          <div key={n.path} className="flex items-center gap-1">
            <button
              onClick={() => toggle(n.path)}
              className="flex-1 min-w-0 truncate text-left"
              style={{ paddingLeft: depth * 14 }}
            >
              {isExpanded ? '▾' : '▸'} {n.name}/
            </button>
            <button
              title="Folder actions"
              onClick={(e) => openMenu(e, n.path, n.path, dirname(n.path), true)}
              className="px-1"
            >
              ⋮
            </button>
          </div>,
          ...(isExpanded ? renderNodes(n.children ?? [], depth + 1) : [])
        ];
      }
      if (!n.name.toLowerCase().endsWith('.md')) return [];
      const dir = dirname(n.path);
      return [
        <div key={n.path} className="flex items-center gap-1">
          <button
            onClick={() => onOpenFile(n.path)}
            className={`flex-1 min-w-0 truncate text-left ${currentPath === n.path ? 'font-semibold' : ''}`}
            style={{ paddingLeft: depth * 14 }}
          >
            {n.name}
          </button>
          <button
            title="File actions"
            onClick={(e) => openMenu(e, n.path, dir, dir, false)}
            className="px-1"
          >
            ⋮
          </button>
        </div>
      ];
    });

  return (
    <>
      <div className="flex-1 overflow-auto p-2 text-sm">
        {renderNodes(tree, 0)}
        {tree.every(n => !hasMd(n)) && (
          <div className="opacity-60">No .md files in this folder.</div>
        )}
      </div>
      {menu && (
        <>
          {/* Click-away layer: clicking anywhere else closes the pop-up. */}
          <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(null)} />
          <div
            className="fixed z-50 flex flex-col gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 text-sm shadow-lg"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.stopPropagation()}
            role="menu"
            aria-label="File actions"
          >
            {(
              [
                ...(menu.isDir
                  ? [
                      {
                        label: 'Open in File Explorer',
                        run: () => {
                          void window.api.openInFileExplorer(menu.path).then((error) => {
                            if (error) window.alert(`Could not open folder:\n${error}`);
                          });
                          setMenu(null);
                        }
                      }
                    ]
                  : []),
                {
                  label: 'New',
                  run: () => {
                    void ask('New file name (in the current folder)', 'new.md').then((name) => {
                      if (name) onCreate(`${menu.createDir}/${name}`);
                      setMenu(null);
                    });
                  }
                },
                {
                  label: 'Rename',
                  run: () => {
                    void ask('New name', menu.name).then((name) => {
                      if (name) onRename(menu.path, `${menu.renameDir}/${name}`);
                      setMenu(null);
                    });
                  }
                },
                {
                  label: 'Delete',
                  run: () => {
                    onDelete(menu.path);
                    setMenu(null);
                  }
                }
              ] as Array<{ label: string; run(): void }>
            ).map((item) => (
              <button
                key={item.label}
                role="menuitem"
                onClick={item.run}
                className="rounded px-2 py-1 text-left hover:bg-[var(--menu-hover)]"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
