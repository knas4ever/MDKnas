import FileExplorer from './FileExplorer';
import OutlineView from './OutlineView';
import type { FileNode } from '../types';

interface Props {
  mode: 'files' | 'outline';
  onToggle(): void;
  tree: FileNode[];
  rootDir: string | null;
  currentPath: string | null;
  onOpenFile(path: string): void;
  onCreate(path: string): void;
  onRename(from: string, to: string): void;
  onDelete(path: string): void;
  content: string;
  onJump(pos: number): void;
  ask(message: string, defaultValue: string): Promise<string | null>;
}

export default function Sidebar({
  mode,
  onToggle,
  tree,
  rootDir,
  currentPath,
  onOpenFile,
  onCreate,
  onRename,
  onDelete,
  content,
  onJump,
  ask
}: Props) {
  return (
    <aside className="sidebar flex flex-col">
      <div className="flex gap-1 p-2">
        {(['files', 'outline'] as const).map(m => (
          <button
            key={m}
            onClick={() => mode !== m && onToggle()}
            className={`rounded px-2 py-0.5 ${
              mode === m ? 'bg-[var(--accent)]/15 font-medium' : 'hover:bg-[var(--accent)]/10'
            }`}
          >
            {m === 'files' ? 'Files' : 'Outline'}
          </button>
        ))}
      </div>
      {mode === 'files' ? (
        <FileExplorer
          tree={tree}
          rootDir={rootDir}
          currentPath={currentPath}
          onOpenFile={onOpenFile}
          onCreate={onCreate}
          onRename={onRename}
          onDelete={onDelete}
          ask={ask}
        />
      ) : (
        <OutlineView content={content} onJump={onJump} />
      )}
    </aside>
  );
}
