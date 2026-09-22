import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ThemeManager from '../../src/components/ThemeManager';
import type { EditorApi } from '../../src/types';

beforeEach(() => {
  window.api = {
    readTheme: vi.fn().mockResolvedValue(':root { --bg: #101010; }'),
    listThemes: vi.fn().mockResolvedValue([])
  } as unknown as EditorApi;
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  document.getElementById('user-theme')?.remove();
});

describe('ThemeManager', () => {
  it('applies the light builtin via data-theme', () => {
    render(<ThemeManager theme="light" onThemeChange={() => {}} />);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('applies the dark builtin via data-theme', () => {
    render(<ThemeManager theme="dark" onThemeChange={() => {}} />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('injects custom theme css', async () => {
    render(<ThemeManager theme="midnight" onThemeChange={() => {}} />);
    await new Promise(r => setTimeout(r, 10));
    expect(document.getElementById('user-theme')?.textContent).toBe(':root { --bg: #101010; }');
  });

  it('falls back to light when the theme file is missing', async () => {
    const onThemeChange = vi.fn();
    (window.api.readTheme as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
    render(<ThemeManager theme="missing" onThemeChange={onThemeChange} />);
    await new Promise(r => setTimeout(r, 10));
    expect(onThemeChange).toHaveBeenCalledWith('light');
  });
});
