import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Sidebar from '../../src/components/Sidebar';
import type { FileNode } from '../../src/types';

const files: FileNode[] = [{ name: 'b.md', path: '/r/b.md', isDir: false }];

const baseProps = {
  mode: 'files' as const,
  onToggle: () => {},
  tree: files,
  rootDir: '/r',
  currentPath: null,
  onOpenFile: () => {},
  onCreate: () => {},
  onRename: () => {},
  onDelete: () => {},
  content: '# Hi',
  onJump: () => {},
  ask: vi.fn().mockResolvedValue('new.md')
};

describe('Sidebar', () => {
  afterEach(cleanup);

  it('opens a file on click', () => {
    const onOpenFile = vi.fn();
    render(<Sidebar {...baseProps} onOpenFile={onOpenFile} />);
    fireEvent.click(screen.getByText('b.md'));
    expect(onOpenFile).toHaveBeenCalledWith('/r/b.md');
  });

  it('highlights the current file', () => {
    render(<Sidebar {...baseProps} currentPath='/r/b.md' />);
    expect(screen.getByText('b.md').className).toContain('font-semibold');
  });

  it('points to the File menu when no folder is open', () => {
    render(<Sidebar {...baseProps} rootDir={null} />);
    expect(screen.getByText(/No folder open/)).toBeTruthy();
    expect(screen.queryByText('b.md')).toBeNull();
  });

  it('offers a new-file action from the row menu', async () => {
    const onCreate = vi.fn();
    const ask = vi.fn().mockResolvedValue('new.md');
    render(<Sidebar {...baseProps} ask={ask} onCreate={onCreate} />);
    fireEvent.click(screen.getByTitle('File actions'));
    fireEvent.click(screen.getByText('New'));
    await new Promise(r => setTimeout(r, 0));
    expect(ask).toHaveBeenCalledWith('New file name (in the current folder)', 'new.md');
    expect(onCreate).toHaveBeenCalledWith('/r/new.md');
  });

  it('shows outline headings and jumps on click', () => {
    const onJump = vi.fn();
    render(<Sidebar {...baseProps} mode="outline" onJump={onJump} />);
    fireEvent.click(screen.getByText('Hi'));
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it('switches views via the Files/Outline tabs and highlights the active one', () => {
    const onToggle = vi.fn();
    render(<Sidebar {...baseProps} onToggle={onToggle} />);
    expect(screen.getByText('Files').className).toContain('font-medium');
    fireEvent.click(screen.getByText('Outline'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    // The active tab does nothing when clicked.
    fireEvent.click(screen.getByText('Files'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
