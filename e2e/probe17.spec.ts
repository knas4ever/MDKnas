import { test, expect, _electron as electron } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const boot = async (name: string, text: string) => {
  const dir = '/tmp/p17';
  mkdirSync(dir, { recursive: true });
  const f = `${dir}/${name}`;
  writeFileSync(f, text);
  const app = await electron.launch({ args: ['.', '--open', f] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(500);
  return { app, win, f };
};

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

test('Enter on the empty last task ends the list; caret at left margin', async () => {
  const { app, win, f } = await boot('end.md', '- [ ] task\n- [ ] \n');
  // click the empty task anchor
  const r = await win.evaluate(() => {
    const el = document.querySelector('li:nth-child(2) span[data-s="17"]');
    const b = el.getBoundingClientRect();
    return { x: b.x + 1, y: b.y + b.height / 2 };
  });
  await win.mouse.click(r.x, r.y);
  await win.waitForTimeout(300);
  await win.keyboard.press('Enter');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(400);
  const t = require('node:fs').readFileSync(f, 'utf8');
  console.log('FILE:', JSON.stringify(t));
  expect(t).toBe('- [ ] task\n'); // the empty task line is gone
  const c = await caretInfo(win);
  console.log('CARET:', JSON.stringify(c));
  // caret must be at the left margin (~350), not in the task text column (~391)
  expect(c && c.x !== null && c.x < 360).toBe(true);
  await app.close();
});

test('ArrowDown keeps the same pixel column across list items', async () => {
  const { app, win } = await boot('col.md', '- [ ] task\n- [ ] task 2\n- [ ] short\n');
  const span = (sel: string) => win.evaluate((s2: string) => {
    const el = document.querySelector(s2) as HTMLElement;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y + b.height / 2, w: b.width };
  }, sel);
  // caret at ~60% across "task"
  const a = await span('li span[data-s="6"]');
  await win.mouse.click(a.x + a.w * 0.5, a.y);
  await win.waitForTimeout(300);
  const c1 = await caretInfo(win);
  await win.keyboard.press('ArrowDown');
  await win.waitForTimeout(300);
  const c2 = await caretInfo(win);
  await win.keyboard.press('ArrowDown');
  await win.waitForTimeout(300);
  const c3 = await caretInfo(win);
  console.log('CARETS:', JSON.stringify([c1, c2, c3]));
  // The character offset must be preserved (pixels vary with glyph widths).
  expect(c1 && c2 && c3).toBeTruthy();
  expect(c2!.o).toBe(c1!.o);
  expect(c3!.o).toBe(c1!.o);
  expect(c1!.x !== null && c2!.x !== null && Math.abs(c2!.x! - c1!.x!)).toBeLessThanOrEqual(6);
  await app.close();
});

test('numbered list: Enter at end of line then Enter ends the list; caret at left margin', async () => {
  const { app, win, f } = await boot('num.md', '4. sda 2ljpijpij\n');
  const r = await win.evaluate(() => {
    const el = document.querySelector('li span[data-s="3"]');
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width - 1, y: b.y + b.height / 2 };
  });
  await win.mouse.click(r.x, r.y);
  await win.waitForTimeout(300);
  // Enter continues the list with "5. "; a second Enter ends it.
  await win.keyboard.press('Enter');
  await win.waitForTimeout(300);
  await win.keyboard.press('Enter');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(400);
  const t = require('node:fs').readFileSync(f, 'utf8');
  console.log('FILE:', JSON.stringify(t));
  expect(t).toBe('4. sda 2ljpijpij\n');
  const c = await caretInfo(win);
  console.log('CARET:', JSON.stringify(c));
  expect(c && c.x !== null && c.x < 360).toBe(true);
  await app.close();
});
