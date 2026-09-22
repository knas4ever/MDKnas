import { test, expect, _electron } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function boot(file: string, content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-probe-'));
  const f = path.join(dir, file);
  fs.writeFileSync(f, content);
  const app = await _electron.launch({ args: ['.', '--open', f] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(700);
  return { app, win, f };
}

test('external edit of the open file reloads the editor', async () => {
  const { app, win, f } = await boot('reload.md', 'first version\n');
  const before = await win.evaluate(() => document.querySelector('.wysiwyg-root')!.textContent);
  console.log('BEFORE:', JSON.stringify(before));
  fs.writeFileSync(f, 'second version\n');
  await win.waitForTimeout(900);
  const after = await win.evaluate(() => document.querySelector('.wysiwyg-root')!.textContent);
  console.log('AFTER:', JSON.stringify(after));
  expect(after).toContain('second version');
  expect(after).not.toContain('first version');
  await app.close();
});

test('ArrowDown crosses from a task list to the next block', async () => {
  const { app, win, f } = await boot('down.md', '- [ ] task\n\nnext para\n');
  // caret into the task text, then Down should land in "next para"
  await win.locator('.wysiwyg-root li span[data-s="6"]').first().click();
  await win.keyboard.press('ArrowDown');
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(400);
  const t = fs.readFileSync(f, 'utf8');
  console.log('AFTER-DOWN-TYPE:', JSON.stringify(t));
  // X must land in the paragraph, not in the task line
  const lines = t.split('\n');
  expect(lines[0]).toBe('- [ ] task');
  expect(lines[2]).toContain('X');
  await app.close();
});

test('ArrowUp crosses back up to the task list', async () => {
  const { app, win, f } = await boot('up.md', '- [ ] task\n\nnext para\n');
  await win.locator('.wysiwyg-root p span[data-s="12"]').first().click();
  // First ArrowUp steps onto the blank line; the second reaches the task.
  await win.keyboard.press('ArrowUp');
  await win.keyboard.press('ArrowUp');
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(400);
  const t = fs.readFileSync(f, 'utf8');
  console.log('AFTER-UP-TYPE:', JSON.stringify(t));
  expect(t.split('\n')[0]).toContain('X');
  expect(t.split('\n')[0].length).toBeGreaterThan('- [ ] task'.length);
  await app.close();
});
