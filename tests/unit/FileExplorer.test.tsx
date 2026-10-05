import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import FileExplorer from '../../src/components/FileExplorer';

describe('FileExplorer', () => {
  afterEach(cleanup);

  it('opens a folder in the system file explorer from its actions menu', async () => {
    const openInFileExplorer = vi.fn().mockResolvedValue('');
    const originalApi = window.api;
    window.api = { ...originalApi, openInFileExplorer };
    const { getByTitle, getByRole } = render(
      <FileExplorer
        tree={[{ name: 'notes', path: 'C:\\notes', isDir: true, children: [{ name: 'a.md', path: 'C:\\notes\\a.md', isDir: false }] }]}
        rootDir="C:\\"
        currentPath={null}
        onOpenFile={() => {}}
        onCreate={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
        ask={async () => null}
      />
    );

    fireEvent.click(getByTitle('Folder actions'));
    fireEvent.click(getByRole('menuitem', { name: 'Open in File Explorer' }));

    await waitFor(() => expect(openInFileExplorer).toHaveBeenCalledWith('C:\\notes'));
    window.api = originalApi;
  });
});
