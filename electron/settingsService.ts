import fs from 'node:fs';
import path from 'node:path';

export interface Settings {
  theme: string;
  fontSize: number;
  autosaveMs: number;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'light', fontSize: 16, autosaveMs: 1000 };

export function loadSettings(dir: string): Settings {
  try {
    const raw = fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8');
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(dir: string, settings: Settings): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2));
}
