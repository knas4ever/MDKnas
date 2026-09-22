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

async function selInfo(win: any): Promise<any> {
  return win.evaluate(() => {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return null;
    const r = s.getRangeAt(0);
    return { text: r.toString(), anchorOffset: r.startOffset, startContainerTag: (r.startContainer as any).tagName };
  });
}

test('mouse drag left-to-right and right-to-left', async () => {
  const file = tempDoc('hello world this is a line');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  const box = win.locator('.wysiwyg-root');
  await win.waitForSelector('.wysiwyg-root');
  const bb = (await box.getByText('hello').boundingBox())!;
  const x0 = bb.x + 2, y0 = bb.y + bb.height / 2;
  const x1 = bb.x + 80, y1 = bb.y + bb.height / 2;

  // left -> right drag
  await win.mouse.move(x0, y0); await win.mouse.down();
  await win.mouse.move(x1, y1); await win.mouse.up();
  await win.waitForTimeout(400);
  console.log('LTR:', JSON.stringify(await selInfo(win)));

  // right -> left drag
  await win.mouse.move(x1, y1); await win.mouse.down();
  await win.mouse.move(x0, y0); await win.mouse.up();
  await win.waitForTimeout(400);
  console.log('RTL:', JSON.stringify(await selInfo(win)));

  await app.close();
});
