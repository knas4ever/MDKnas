import fs from 'node:fs';
import path from 'node:path';

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store']);
const MAX_DEPTH = 5;

export function listFiles(dir: string): FileNode[] {
  function walk(d: string, depth: number): FileNode[] {
    return fs
      .readdirSync(d, { withFileTypes: true })
      .filter(e => !IGNORED.has(e.name))
      .sort((a, b) =>
        a.isDirectory() === b.isDirectory()
          ? a.name.localeCompare(b.name)
          : a.isDirectory()
            ? -1
            : 1
      )
      .map(e => {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          return {
            name: e.name,
            path: full,
            isDir: true,
            children: depth < MAX_DEPTH ? walk(full, depth + 1) : []
          };
        }
        return { name: e.name, path: full, isDir: false };
      });
  }
  return walk(dir, 0);
}

export function readFile(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

export function writeFile(p: string, content: string): void {
  fs.writeFileSync(p, content, 'utf-8');
}

export function createFile(p: string, content = ''): void {
  fs.writeFileSync(p, content, 'utf-8');
}

export function renameFile(from: string, to: string): void {
  fs.renameSync(from, to);
}

export function deleteFile(p: string): void {
  fs.rmSync(p, { recursive: true });
}

export function watchDir(
  dir: string,
  cb: (event: string, filename: string) => void
): () => void {
  let timer: NodeJS.Timeout | null = null;
  const watcher = fs.watch(dir, { recursive: true, persistent: false }, (eventType, filename) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => cb(eventType, filename ?? ''), 100);
  });
  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}
