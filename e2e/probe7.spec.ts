import { test, _electron } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

test('multi-line drags top->bottom and bottom->top, then type', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-probe-'));
  const file = path.join(dir, 'd.md');
  fs.writeFileSync(file, '## Heading\nfirst line\nsecond line\n');
  const app = await _electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(700);

  const head = (await win.locator('.wysiwyg-root h2 span[data-s="3"]').first().boundingBox())!;
  const l2 = (await win.locator('.wysiwyg-root p span[data-s="22"]').first().boundingBox())!;

  // top -> bottom: start in "Heading", drag down to "second line"
  await win.mouse.move(head.x + 4, head.y + head.height / 2);
  await win.mouse.down();
  for (let y = head.y; y <= l2.y + l2.height / 2; y += 10) {
    await win.mouse.move(head.x + 4, y);
  }
  await win.mouse.up();
  await win.waitForTimeout(300);
  const dom1 = await win.evaluate(() => window.getSelection()?.toString());
  console.log('T2B-DOM:', JSON.stringify(dom1));
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(300);
  console.log('AFTER-T2B:', JSON.stringify(fs.readFileSync(file, 'utf8')));

  fs.writeFileSync(file, '## Heading\nfirst line\nsecond line\n');
  await win.waitForTimeout(500);

  // bottom -> top: start in "second line", drag up to "Heading"
  await win.mouse.move(l2.x + 4, l2.y + l2.height / 2);
  await win.mouse.down();
  for (let y = l2.y + l2.height / 2; y >= head.y + head.height / 2; y -= 10) {
    await win.mouse.move(l2.x + 4, y);
  }
  await win.mouse.up();
  await win.waitForTimeout(300);
  const dom2 = await win.evaluate(() => window.getSelection()?.toString());
  console.log('B2T-DOM:', JSON.stringify(dom2));
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(300);
  console.log('AFTER-B2T:', JSON.stringify(fs.readFileSync(file, 'utf8')));
  await app.close();
});
