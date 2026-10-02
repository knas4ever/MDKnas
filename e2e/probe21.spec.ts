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

const launch = async (file: string) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mdknas-profile-'));
  return electron.launch({ args: ['.', '--open', file, `--user-data-dir=${profile}`] });
};

const boot = async (content: string) => {
  const file = tempDoc(content);
  const app = await launch(file);
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

test('raw mode: bold then italic at the caret keeps the bold', async () => {
  const { app, win, file } = await boot('hello world\n');
  await win.keyboard.press('Control+End');
  await win.keyboard.press('ArrowLeft');
  await win.waitForTimeout(200);

  await win.getByTitle('Bold (Ctrl+B)').click();
  await win.waitForTimeout(400);
  const afterBold = await taState(win);
  console.log('AFTER-BOLD:', JSON.stringify(afterBold));
  expect(afterBold.v).toBe('hello world****\n');
  expect(afterBold.start).toBe(13);

  await win.getByTitle('Italic (Ctrl+I)').click();
  await win.waitForTimeout(400);
  const afterItalic = await taState(win);
  console.log('AFTER-ITALIC:', JSON.stringify(afterItalic));
  // The bold must survive: the italic pair nests inside it.
  expect(afterItalic.v).toBe('hello world******\n');
  expect(afterItalic.start).toBe(14);
  expect(afterItalic.hasFocus).toBe(true);

  await win.keyboard.press('Control+s');
  await win.waitForTimeout(600);
  console.log('FILE:', JSON.stringify(fs.readFileSync(file, 'utf8')));
  expect(fs.readFileSync(file, 'utf8')).toBe('hello world******\n');
  await app.close();
});

const richCaret = (win: any) => win.evaluate(() => {
  const s = window.getSelection();
  if (!s || s.rangeCount === 0) return null;
  const r = s.getRangeAt(0);
  const n = r.startContainer;
  const p = n && n.parentElement;
  return {
    s: p && p.getAttribute('data-s'),
    o: r.startOffset,
    gap: p && p.getAttribute('data-gap')
  };
});

test('rich mode: bold then italic at the caret keeps the bold', async () => {
  const file = tempDoc('hello world\n');
  const app = await launch(file);
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(400);
  await win.locator('.wysiwyg-root').first().click();
  await win.keyboard.press('Control+Home');
  for (let i = 0; i < 11; i++) await win.keyboard.press('ArrowRight');
  await win.waitForTimeout(300);
  console.log('RICH CARET:', JSON.stringify(await richCaret(win)));
  await win.getByTitle('Bold (Ctrl+B)').click();
  await win.waitForTimeout(400);
  console.log('RICH AFTER-BOLD:', JSON.stringify(await richCaret(win)), JSON.stringify(await win.locator('.wysiwyg-root').textContent()));
  await win.getByTitle('Italic (Ctrl+I)').click();
  await win.waitForTimeout(400);
  console.log('RICH AFTER-ITALIC:', JSON.stringify(await richCaret(win)), JSON.stringify(await win.locator('.wysiwyg-root').textContent()));
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(700);
  const t = fs.readFileSync(file, 'utf8');
  console.log('RICH-FILE:', JSON.stringify(t));
  expect(t).toBe('hello ***world***\n');
  await app.close();
});

test('rich mode: one Right steps past the whole bold marker', async () => {
  const file = tempDoc('hello world\n');
  const app = await launch(file);
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(400);
  await win.locator('.wysiwyg-root').first().click();
  await win.keyboard.press('Control+Home');
  for (let i = 0; i < 6; i++) await win.keyboard.press('ArrowRight');
  await win.keyboard.down('Shift');
  for (let i = 0; i < 5; i++) await win.keyboard.press('ArrowRight');
  await win.keyboard.up('Shift');
  await win.waitForTimeout(300);
  await win.getByTitle('Bold (Ctrl+B)').click();
  await win.waitForTimeout(400);
  // Collapse the selection, then a single Right must pass the whole '**'
  await win.keyboard.press('ArrowRight');
  await win.waitForTimeout(300);
  await win.keyboard.press('ArrowRight');
  await win.waitForTimeout(300);
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(700);
  const t = fs.readFileSync(file, 'utf8');
  console.log('BOLD-RIGHT:', JSON.stringify(t));
  expect(t).toBe('hello **world**X\n');

  // One Left from just outside the closing marker must step back inside the
  // bold (the caret sits at 16 after typing X, 15 is outside the markers).
  await win.keyboard.press('ArrowLeft');
  await win.waitForTimeout(300);
  await win.keyboard.press('ArrowLeft');
  await win.waitForTimeout(300);
  await win.keyboard.type('Y');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(700);
  const t2 = fs.readFileSync(file, 'utf8');
  console.log('BOLD-LEFT:', JSON.stringify(t2));
  expect(t2).toBe('hello **worldY**X\n');
  await app.close();
});

test('rich mode: one Right steps past bold+italic markers', async () => {
  const file = tempDoc('hello world\n');
  const app = await launch(file);
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(400);
  await win.locator('.wysiwyg-root').first().click();
  await win.keyboard.press('Control+Home');
  for (let i = 0; i < 6; i++) await win.keyboard.press('ArrowRight');
  await win.keyboard.down('Shift');
  for (let i = 0; i < 5; i++) await win.keyboard.press('ArrowRight');
  await win.keyboard.up('Shift');
  await win.waitForTimeout(300);
  await win.getByTitle('Bold (Ctrl+B)').click();
  await win.waitForTimeout(400);
  await win.getByTitle('Italic (Ctrl+I)').click();
  await win.waitForTimeout(400);
  await win.keyboard.press('ArrowRight');
  await win.waitForTimeout(300);
  await win.keyboard.press('ArrowRight');
  await win.waitForTimeout(300);
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(700);
  const t = fs.readFileSync(file, 'utf8');
  console.log('BOLD-ITALIC-RIGHT:', JSON.stringify(t));
  expect(t).toBe('hello ***world***X\n');
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
