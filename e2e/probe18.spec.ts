import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempDoc(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-probe-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, content);
  return file;
}

const caretInfo = (win: any) => win.evaluate(() => {
  const s = window.getSelection();
  if (!s || s.rangeCount === 0) return null;
  const n = s.anchorNode;
  const p = n && n.parentElement;
  const r = s.getRangeAt(0).getBoundingClientRect();
  return {
    s: p && p.getAttribute('data-s'),
    e: p && p.getAttribute('data-e'),
    o: s.anchorOffset,
    x: r.left ? r.left : null
  };
});

test('cursor on the blank line below a list sits at the left margin', async () => {
  const file = tempDoc('4. sda 2ljpijpij\n\n');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(500);
  // The blank line must render at the list level (inside the <ol>), not inside the <li>
  const pos = await win.evaluate(() => {
    const div = document.querySelector('div[data-blank-line]');
    const inOl = !!div?.closest('ol') && !div?.closest('li');
    const b = div.getBoundingClientRect();
    return { inOl, x: b.x };
  });
  console.log('BLANK:', JSON.stringify(pos));
  expect(pos.inOl).toBe(true);
  // Click the blank line: caret must be at the left margin (~350), not the list-text column
  await win.locator('div[data-blank-line] span').first().click();
  await win.waitForTimeout(300);
  const c = await caretInfo(win);
  console.log('CARET:', JSON.stringify(c));
  expect(c && c.x !== null && c.x < 360).toBe(true);
  // Typing on that line must produce a paragraph after the blank line (left margin)
  await win.keyboard.type('x');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(400);
  const t = fs.readFileSync(file, 'utf8');
  console.log('FILE:', JSON.stringify(t));
  expect(t).toBe('4. sda 2ljpijpij\n\nx');
  const c2 = await caretInfo(win);
  console.log('CARET2:', JSON.stringify(c2));
  expect(c2 && c2.x !== null && c2.x < 380).toBe(true);
  // ArrowUp from the paragraph: first onto the blank line, then the list line
  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(300);
  const c3 = await caretInfo(win);
  console.log('CARET3:', JSON.stringify(c3));
  expect(c3 && c3.s === '17').toBe(true); // blank line
  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(300);
  const c4 = await caretInfo(win);
  console.log('CARET4:', JSON.stringify(c4));
  expect(c4 && c4.s === '3').toBe(true); // task line
  await app.close();
});
