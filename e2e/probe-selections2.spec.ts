import { test, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempDoc(initial: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-probe-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, initial);
  return file;
}

async function selText(win: any): Promise<string | null> {
  return win.evaluate(() => {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return null;
    return s.getRangeAt(0).toString();
  });
}

test('multi-line drag down and up; keyboard left selection', async () => {
  const file = tempDoc('line one\nline two');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  const box = win.locator('.wysiwyg-root');
  await win.waitForSelector('.wysiwyg-root');

  const a = (await box.getByText('line one').boundingBox())!;
  const b = (await box.getByText('line two').boundingBox())!;

  // top -> bottom drag
  await win.mouse.move(a.x + 2, a.y + a.height / 2); await win.mouse.down();
  await win.mouse.move(b.x + b.width - 2, b.y + b.height / 2); await win.mouse.up();
  await win.waitForTimeout(400);
  console.log('T2B:', JSON.stringify(await selText(win)));

  // bottom -> top drag
  await win.mouse.move(b.x + b.width - 2, b.y + b.height / 2); await win.mouse.down();
  await win.mouse.move(a.x + 2, a.y + a.height / 2); await win.mouse.up();
  await win.waitForTimeout(400);
  console.log('B2T:', JSON.stringify(await selText(win)));

  // keyboard: caret at end, shift+left
  await win.keyboard.press('Control+End');
  await win.keyboard.down('Shift');
  await win.keyboard.press('ArrowLeft'); await win.keyboard.press('ArrowLeft'); await win.keyboard.press('ArrowLeft');
  await win.keyboard.up('Shift');
  await win.waitForTimeout(400);
  console.log('KBD-LEFT:', JSON.stringify(await selText(win)));

  // caret at start, shift+right
  await win.keyboard.press('Control+Home');
  await win.keyboard.down('Shift');
  await win.keyboard.press('ArrowRight'); await win.keyboard.press('ArrowRight'); await win.keyboard.press('ArrowRight');
  await win.keyboard.up('Shift');
  await win.waitForTimeout(400);
  console.log('KBD-RIGHT:', JSON.stringify(await selText(win)));

  await app.close();
});
