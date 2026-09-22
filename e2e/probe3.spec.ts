import { test, _electron } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

test('heading after task list: positions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-probe-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, '- [ ] task\n\n## Heading\n');
  const app = await _electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(800);
  const info = await win.evaluate(() => {
    const root = document.querySelector('.wysiwyg-root')!;
    const h2 = root.querySelector('h2')!;
    const ul = root.querySelector('ul')!;
    const li = root.querySelector('li')!;
    const r = root.getBoundingClientRect();
    const h = h2.getBoundingClientRect();
    const u = ul.getBoundingClientRect();
    const l = li.getBoundingClientRect();
    return {
      root: { x: r.x, w: r.width },
      h2: { x: h.x, w: h.width, text: h2.textContent },
      ul: { x: u.x, w: u.width },
      li: { x: l.x, w: l.width },
      html: root.innerHTML
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await app.close();
});

test('empty task: click checkbox / click anchor / type', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-probe-'));
  const file = path.join(dir, 't.md');
  fs.writeFileSync(file, '- [ ] \n');
  const app = await _electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(800);

  const li = win.locator('.task-item');
  const cb = win.locator('.task input').first();
  const anchor = win.locator('.task-item span[data-s="6"][data-e="6"]').first();

  // 1) click on the checkbox itself, then type
  await cb.click();
  await win.keyboard.type('abc');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  console.log('AFTER-CHECKBOX-CLICK-TYPE:', fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, '- [ ] \n');
  await win.waitForTimeout(500);

  // 2) click in the empty area after the checkbox, then type
  await anchor.click();
  await win.keyboard.type('abc');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  console.log('AFTER-ANCHOR-CLICK-TYPE:', fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, '- [ ] \n');
  await win.waitForTimeout(500);

  // 3) click on the left edge of the anchor (the seam right of the checkbox)
  await anchor.click({ position: { x: 0.5, y: 5 } });
  const selInfo = await win.evaluate(() => {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return 'none';
    const r = s.getRangeAt(0);
    const p = r.startContainer.parentElement;
    return `N=${r.startContainer.nodeName}[${p?.getAttribute('data-s')},${p?.getAttribute('data-e')}|gap=${p?.getAttribute('data-gap')}] o=${r.startOffset}`;
  });
  console.log('SEAM-SEL:', selInfo);
  await win.keyboard.type('abc');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  console.log('AFTER-SEAM-CLICK-TYPE:', JSON.stringify(fs.readFileSync(file, 'utf8')));

  await app.close();
});
