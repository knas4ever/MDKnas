import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempDoc(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdknas-src-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, content);
  return file;
}

const taState = (win: any) => win.evaluate(() => {
  const t = document.querySelector('textarea.source-view');
  if (!t) return null;
  return {
    v: t.value,
    start: t.selectionStart,
    end: t.selectionEnd,
    hasFocus: document.activeElement === t
  };
});

const boot = async (content: string) => {
  const file = tempDoc(content);
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(400);
  await win.getByTitle('Toggle raw markdown / rich text view').click();
  await win.waitForTimeout(400);
  await win.locator('textarea.source-view').first().click();
  await win.waitForTimeout(200);
  return { app, win, file };
};

test('raw mode: bold on a selected word wraps the word', async () => {
  const { app, win, file } = await boot('hello world\n');
  // Caret before "world", then select exactly the five letters
  await win.keyboard.press('Control+Home');
  for (let i = 0; i < 6; i++) await win.keyboard.press('ArrowRight');
  await win.waitForTimeout(200);
  await win.keyboard.down('Shift');
  for (let i = 0; i < 5; i++) await win.keyboard.press('ArrowRight');
  await win.keyboard.up('Shift');
  await win.waitForTimeout(300);
  const sel = await taState(win);
  console.log('SELECTED:', JSON.stringify(sel));
  expect(sel.v).toBe('hello world\n');
  expect([sel.start, sel.end]).toEqual([6, 11]);

  await win.getByTitle('Bold (Ctrl+B)').click();
  await win.waitForTimeout(500);
  const after = await taState(win);
  console.log('AFTER-BOLD:', JSON.stringify(after));
  expect(after.v).toBe('hello **world**\n');
  expect(after.hasFocus).toBe(true);
  await app.close();
});

test('raw mode: bold on a selection in a CRLF document', async () => {
  const { app, win } = await boot('hello world\r\nsecond line\r\n');
  // The textarea normalizes CRLF to LF: caret at textarea offset 12 is
  // source offset 13, the start of "second".
  await win.keyboard.press('Control+Home');
  for (let i = 0; i < 12; i++) await win.keyboard.press('ArrowRight');
  await win.keyboard.down('Shift');
  for (let i = 0; i < 6; i++) await win.keyboard.press('ArrowRight');
  await win.keyboard.up('Shift');
  await win.waitForTimeout(300);
  console.log('SELECTED:', JSON.stringify(await taState(win)));

  await win.getByTitle('Bold (Ctrl+B)').click();
  await win.waitForTimeout(500);
  const after = await taState(win);
  console.log('AFTER-BOLD:', JSON.stringify(after));
  expect(after.v).toBe('hello world\n**second** line\n');
  await app.close();
});

test('raw mode: bold with an empty selection keeps the caret in place', async () => {
  const { app, win, file } = await boot('hello world\n');
  await win.keyboard.press('Control+End');
  await win.keyboard.press('ArrowLeft');
  await win.waitForTimeout(300);
  const before = await taState(win);
  console.log('BEFORE:', JSON.stringify(before));
  expect(before.hasFocus).toBe(true);

  await win.getByTitle('Bold (Ctrl+B)').click();
  await win.waitForTimeout(500);
  const after = await taState(win);
  console.log('AFTER-BOLD:', JSON.stringify(after));
  expect(after.v).toBe('hello world****\n');
  // The caret must stay inside the new markers, and the textarea focused, so
  // typing continues without the user re-placing the cursor.
  expect(after.hasFocus).toBe(true);
  expect(after.start).toBe(13);
  await win.keyboard.type('X');
  await win.waitForTimeout(300);
  const typed = await taState(win);
  console.log('AFTER-TYPE:', JSON.stringify(typed));
  expect(typed.v).toBe('hello world**X**\n');
  await app.close();
});
