import { test, _electron } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

test('drag instrumentation: log every selectionchange during RTL drag', async () => {
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
      if (!s || s.rangeCount === 0) {
        (window as any).__log.push(null);
        return;
      }
      const r = s.getRangeAt(0);
      (window as any).__log.push({
        a: r.startContainer.nodeName + '(' + (r.startContainer as any).textContent?.slice(0, 4) + '):' + r.startOffset,
        f: r.endContainer.nodeName + '(' + (r.endContainer as any).textContent?.slice(0, 4) + '):' + r.endOffset,
        t: s.toString()
      });
    });
  });

  const eb = await win.locator('.wysiwyg-root').boundingBox();
  const x1 = eb.x + eb.width - 40;
  const x0 = eb.x + 25;
  await win.mouse.move(x1, eb.y + 8);
  await win.mouse.down();
  for (let x = x1; x >= x0; x -= 20) await win.mouse.move(x, eb.y + 8);
  await win.mouse.up();
  await win.waitForTimeout(300);

  const log = await win.evaluate(() => (window as any).__log);
  console.log('LOG:', JSON.stringify(log, null, 0));
  await app.close();
});
