import { test, _electron } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

test('does selectionchange fire on plain click / drag?', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-probe-'));
  const file = path.join(dir, 'd.md');
  fs.writeFileSync(file, 'hello world foo\n');
  const app = await _electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(700);

  await win.evaluate(() => {
    (window as any).__log = [];
    document.addEventListener('selectionchange', () => {
      const s = window.getSelection();
      (window as any).__log.push(
        s && s.rangeCount
          ? s.getRangeAt(0).startContainer.nodeName + ':' + s.getRangeAt(0).startOffset + '|' + s.toString()
          : 'none'
      );
    });
  });

  const eb = await win.locator('.wysiwyg-root').boundingBox();
  console.log('EB:', JSON.stringify(eb));
  // plain click into the text
  await win.mouse.click(eb.x + 40, eb.y + 8);
  await win.waitForTimeout(300);
  console.log('AFTER-CLICK:', JSON.stringify(await win.evaluate(() => (window as any).__log)));

  // drag RTL
  await win.evaluate(() => { (window as any).__log = []; });
  await win.mouse.move(eb.x + 100, eb.y + 8);
  await win.mouse.down();
  for (let x = eb.x + 100; x >= eb.x + 25; x -= 20) await win.mouse.move(x, eb.y + 8);
  await win.mouse.up();
  await win.waitForTimeout(300);
  console.log('AFTER-DRAG:', JSON.stringify(await win.evaluate(() => (window as any).__log)));
  const domSel = await win.evaluate(() => window.getSelection()?.toString());
  console.log('DOM-SEL:', JSON.stringify(domSel));
  await app.close();
});
