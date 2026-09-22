import { test, _electron } from '@playwright/test';
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

test('RTL drag inside the text, then type', async () => {
  const { app, win, f } = await boot('sel.md', 'hello world foo\n');
  const bb = (await win.locator('.wysiwyg-root span[data-s="0"]').first().boundingBox())!;
  const y = bb.y + bb.height / 2;
  const x1 = bb.x + bb.width - 6; // over "foo"
  const x0 = bb.x + 3; // over "h"
  await win.mouse.move(x1, y);
  await win.mouse.down();
  for (let x = x1; x >= x0; x -= 10) await win.mouse.move(x, y);
  await win.mouse.up();
  await win.waitForTimeout(300);
  const dom = await win.evaluate(() => window.getSelection()?.toString());
  console.log('RTL-DOM:', JSON.stringify(dom));
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(300);
  console.log('AFTER-RTL-TYPE:', JSON.stringify(fs.readFileSync(f, 'utf8')));
  await app.close();
});

test('cross-block bottom-to-top drag, then type', async () => {
  const { app, win, f } = await boot('sel2.md', '## Heading\nfirst line\nsecond line\n');
  const head = (await win.locator('.wysiwyg-root h2 span[data-s="3"]').first().boundingBox())!;
  const l2 = (await win.locator('.wysiwyg-root p span[data-s="22"]').first().boundingBox())!;
  const y1 = l2.y + l2.height / 2;
  const y0 = head.y + head.height / 2;
  const x = l2.x + l2.width / 2;
  await win.mouse.move(x, y1);
  await win.mouse.down();
  for (let y = y1; y >= y0; y -= 10) await win.mouse.move(x, y);
  await win.mouse.up();
  await win.waitForTimeout(300);
  const dom = await win.evaluate(() => window.getSelection()?.toString());
  console.log('B2T-DOM:', JSON.stringify(dom));
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(300);
  console.log('AFTER-B2T-TYPE:', JSON.stringify(fs.readFileSync(f, 'utf8')));
  await app.close();
});

test('shift+click leftward over the text, then type', async () => {
  const { app, win, f } = await boot('sel3.md', 'abcdef ghij\n');
  const bb = (await win.locator('.wysiwyg-root span[data-s="0"]').first().boundingBox())!;
  const y = bb.y + bb.height / 2;
  await win.mouse.click(bb.x + bb.width - 6, y);
  await win.keyboard.down('Shift');
  await win.mouse.down(bb.x + 3, y);
  await win.mouse.up();
  await win.keyboard.up('Shift');
  await win.waitForTimeout(300);
  const dom = await win.evaluate(() => window.getSelection()?.toString());
  console.log('SHIFT-CLICK-LEFT:', JSON.stringify(dom));
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(300);
  console.log('AFTER-SHIFTCLICK-TYPE:', JSON.stringify(fs.readFileSync(f, 'utf8')));
  await app.close();
});

test('empty task: navigate away and back, then type', async () => {
  const { app, win, f } = await boot('t.md', '- [ ] \n\npara\n');
  const anchor = win.locator('.task-item span[data-s="6"][data-e="6"]').first();
  const cb = win.locator('.task input').first();
  const para = win.locator('.wysiwyg-root p, .wysiwyg-root div').filter({ hasText: 'para' }).first();

  // click the anchor, navigate away, come back via the checkbox
  await anchor.click();
  await para.click();
  await cb.click();
  await win.keyboard.type('abc');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  console.log('CHECKBOX-RETURN-TYPE:', JSON.stringify(fs.readFileSync(f, 'utf8')));
  fs.writeFileSync(f, '- [ ] \n\npara\n');
  await win.waitForSelector('.task-item span[data-s="6"][data-e="6"]', { timeout: 10000 });
  await win.waitForTimeout(300);

  // come back via the anchor
  await anchor.click();
  await para.click();
  await anchor.click();
  await win.keyboard.type('abc');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  console.log('ANCHOR-RETURN-TYPE:', JSON.stringify(fs.readFileSync(f, 'utf8')));
  await app.close();
});
