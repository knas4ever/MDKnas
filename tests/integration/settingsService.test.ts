import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../electron/settingsService';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('settingsService', () => {
  it('returns defaults when no file exists', () => {
    expect(loadSettings(dir)).toEqual(DEFAULT_SETTINGS);
  });

  it('saves and loads settings', () => {
    const s = { ...DEFAULT_SETTINGS, theme: 'dark' };
    saveSettings(dir, s);
    expect(loadSettings(dir)).toEqual(s);
  });

  it('merges a partial saved file with defaults', () => {
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: 'dark' }));
    expect(loadSettings(dir)).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });
});
