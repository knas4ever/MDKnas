import { test, _electron } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

test('instrument shift+click extension', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-probe-'));
  const file = path.join(dir, 'd.md');
  fs.writeFileSync(file, 'abcdef ghij\n');
  const app = await _electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(700);

  await win.evaluate(() => {
    (window as any).__log = [];
    document.addEventListener('selectionchange', () => {
      const s = window.getSelection();
      if (!s || s.rangeCount === 0) {
        (window as any).__log.push('none');
        return;
      }
      (window as any).__log.push(
        `A=${s.anchorNode.nodeName}:${s.anchorOffset} F=${s.focusNode.nodeName}:${s.focusOffset} T=${JSON.stringify(s.toString())}`
      );
    });
  });

  const bb = (await win.locator('.wysiwyg-root span[data-s="0"]').first().boundingBox())!;
  const y = bb.y + bb.height / 2;

  await win.mouse.click(bb.x + bb.width - 6, y);
  await win.waitForTimeout(300);
  console.log('AFTER-CLICK:', JSON.stringify(await win.evaluate(() => (window as any).__log)));

  await win.evaluate(() => { (window as any).__log = []; });
  await win.keyboard.down('Shift');
  await win.mouse.down(bb.x + 3, y);
  await win.mouse.up();
  await win.keyboard.up('Shift');
  await win.waitForTimeout(300);
  console.log('AFTER-SHIFTCLICK:', JSON.stringify(await win.evaluate(() => (window as any).__log)));
  await app.close();
});
