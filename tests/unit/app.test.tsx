import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import App from '../../src/App';
import type { EditorApi, Settings } from '../../src/types';

function mockApi(files: Record<string, string>) {
  const state: Record<string, string> = { ...files };
  const api: EditorApi = {
    openFolder: vi.fn().mockResolvedValue('/r'),
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockImplementation((p: string) => Promise.resolve(state[p] ?? '')),
    writeFile: vi.fn().mockImplementation((p: string, c: string) => {
      state[p] = c;
    }),
    createFile: vi.fn().mockResolvedValue(undefined),
    renameFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    watchDir: vi.fn().mockResolvedValue(undefined),
    onWatch: vi.fn().mockReturnValue(() => {}),
    onOpenFolder: vi.fn().mockReturnValue(() => {}),
    onOpenFile: vi.fn().mockReturnValue(() => {}),
    readImageAsDataUrl: vi.fn().mockResolvedValue(null),
    onMenu: vi.fn().mockReturnValue(() => {}),
    setSourceMenuState: vi.fn(),
    loadSettings: vi.fn().mockResolvedValue({ theme: 'light', fontSize: 16, autosaveMs: 100 }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    listThemes: vi.fn().mockResolvedValue([]),
    readTheme: vi.fn().mockRejectedValue(new Error('none'))
  };
  return { api, state };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('App', () => {
  it('loads a file via onOpenFile and autosaves after debounce', async () => {
    let openCb: ((p: string) => void) | null = null;
    const { api } = mockApi({ '/r/one.md': 'old' });
    api.onOpenFile = vi.fn().mockImplementation((cb: (p: string) => void) => {
      openCb = cb;
      return () => {};
    });
    window.api = api;
    render(<App />);
    await act(async () => {});

    await act(async () => {
      openCb!('/r/one.md');
    });
    expect(screen.queryByText('No file open')).toBeNull();

    const box = screen.getByRole('textbox');
    // jsdom has no textInput events and no keypress `which`, so type via
    // composition events (bubbles required so React's root listener sees them)
    fireEvent(box, new CompositionEvent('compositionstart', { data: '', bubbles: true }));
    fireEvent(box, new CompositionEvent('compositionend', { data: 'X', bubbles: true }));

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(api.writeFile).toHaveBeenCalledWith('/r/one.md', 'Xold');
  });

  it('ctrl+s saves immediately', async () => {
    let openCb: ((p: string) => void) | null = null;
    const { api } = mockApi({ '/r/two.md': 'hi' });
    api.onOpenFile = vi.fn().mockImplementation((cb: (p: string) => void) => {
      openCb = cb;
      return () => {};
    });
    window.api = api;
    render(<App />);
    await act(async () => {});

    await act(async () => {
      openCb!('/r/two.md');
    });

    const box = screen.getByRole('textbox');
    fireEvent(box, new CompositionEvent('compositionstart', { data: '', bubbles: true }));
    fireEvent(box, new CompositionEvent('compositionend', { data: '!', bubbles: true }));

    await act(async () => {
      fireEvent(document, new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    });

    expect(api.writeFile).toHaveBeenCalledWith('/r/two.md', '!hi');
  });

  it('reloads the open file when it changes on disk (even via rename)', async () => {
    let openCb: ((p: string) => void) | null = null;
    let watchCb: ((event: string, filename: string) => void) | null = null;
    let menuCb: ((action: string) => void) | null = null;
    const { api, state } = mockApi({ '/r/one.md': 'old' });
    api.onOpenFile = vi.fn().mockImplementation((cb: (p: string) => void) => {
      openCb = cb;
      return () => {};
    });
    api.onWatch = vi.fn().mockImplementation((cb: (event: string, filename: string) => void) => {
      watchCb = cb;
      return () => {};
    });
    api.onMenu = vi.fn().mockImplementation((cb: (action: string) => void) => {
      menuCb = cb;
      return () => {};
    });
    window.api = api;
    render(<App />);
    await act(async () => {});

    await act(async () => {
      menuCb!('openFolder');
    });
    await act(async () => {
      openCb!('/r/one.md');
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('textbox').textContent).toContain('old');

    // External editor replaces the file (fs event is 'rename').
    state['/r/one.md'] = 'changed on disk';
    await act(async () => {
      watchCb!('rename', 'one.md');
    });
    expect(screen.getByRole('textbox').textContent).toContain('changed on disk');
  });
});
