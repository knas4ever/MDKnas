import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listFiles, readFile, writeFile, createFile, renameFile, deleteFile } from '../../electron/fileService';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('fileService', () => {
  it('lists a tree with directories first, sorted', () => {
    fs.mkdirSync(path.join(dir, 'b'));
    fs.mkdirSync(path.join(dir, 'a'));
    fs.writeFileSync(path.join(dir, 'z.md'), 'hi');
    fs.writeFileSync(path.join(dir, 'a', 'x.md'), 'x');
    const tree = listFiles(dir);
    expect(tree.map(n => n.name)).toEqual(['a', 'b', 'z.md']);
    expect(tree[0].children?.map(n => n.name)).toEqual(['x.md']);
  });

  it('ignores .git and node_modules', () => {
    fs.mkdirSync(path.join(dir, '.git'));
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'f.md'), 'f');
    expect(listFiles(dir).map(n => n.name)).toEqual(['f.md']);
  });

  it('round-trips utf-8 content', () => {
    writeFile(path.join(dir, 'f.md'), 'héllo **w**');
    expect(readFile(path.join(dir, 'f.md'))).toBe('héllo **w**');
  });

  it('creates, renames, deletes files', () => {
    const p = path.join(dir, 'new.md');
    createFile(p, 'a');
    renameFile(p, path.join(dir, 'renamed.md'));
    expect(readFile(path.join(dir, 'renamed.md'))).toBe('a');
    deleteFile(path.join(dir, 'renamed.md'));
    expect(fs.existsSync(path.join(dir, 'renamed.md'))).toBe(false);
  });
});
