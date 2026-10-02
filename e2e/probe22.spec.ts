import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempDoc(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdknas-wrap-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, content);
  return file;
}

const launch = async (file: string) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mdknas-profile-'));
  return electron.launch({ args: ['.', '--open', file, `--user-data-dir=${profile}`] });
};

const caretInfo = (win: any) => win.evaluate(() => {
  const s = window.getSelection();
  if (!s || s.rangeCount === 0) return null;
  const r = s.getRangeAt(0);
  const n = r.startContainer;
  const p = n && n.parentElement;
  return {
    s: p && p.getAttribute('data-s'),
    o: r.startOffset,
    x: Math.round(r.left),
    y: Math.round(r.top)
  };
});

test('three-line wrapped item: Down stays inside it twice', async () => {
  const long = 'lorem ipsum dolor sit amet catnip dolor sit amet lorem ipsum dolor sit amet catnip dolor sit amet lorem ipsum dolor sit amet catnip dolor sit amet lorem ipsum dolor sit amet catnip dolor sit amet lorem ipsum dolor sit amet catnip dolor sit amet lorem ipsum dolor sit amet catnip dolor';
  const file = tempDoc(`- ${long}\n- next item\n`);
  const app = await launch(file);
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(500);
  const a = await win.evaluate(() => {
    const li = document.querySelector('li');
    const span = li.querySelector('span:not([data-gap])') as HTMLElement;
    const b = span.getBoundingClientRect();
    return { x: b.left + 20, y: b.top + 5 };
  });
  await win.mouse.click(a.x, a.y);
  await win.waitForTimeout(300);
  const c0 = await caretInfo(win);
  await win.keyboard.press('ArrowDown');
  await win.waitForTimeout(250);
  const c1 = await caretInfo(win);
  await win.keyboard.press('ArrowDown');
  await win.waitForTimeout(250);
  const c2 = await caretInfo(win);
  console.log('THREE:', JSON.stringify([c0, c1, c2]));
  // Two presses stay inside the same wrapped item
  expect(c1.s).toBe(c0.s);
  expect(c2.s).toBe(c0.s);
  expect(c2.o).toBeGreaterThan(c1.o);
  await app.close();
});

test('wrapped list item: ArrowDown steps to the next visual line', async () => {
  const long = 'aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm nnn ooo ppp qqq rrr sss ttt uuu vvv www xxx yyy zzz aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm nnn ooo ppp qqq rrr sss ttt';
  const file = tempDoc(`- ${long} END\n- second item\n`);
  const app = await launch(file);
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(500);
  // Click near the start of the first (wrapped) line of the long item
  const a = await win.evaluate(() => {
    const li = document.querySelector('li');
    const span = li.querySelector('span:not([data-gap])') as HTMLElement;
    const b = span.getBoundingClientRect();
    return { x: b.left + 20, y: b.top + 5 };
  });
  await win.mouse.click(a.x, a.y);
  await win.waitForTimeout(300);
  const c0 = await caretInfo(win);
  await win.keyboard.press('ArrowDown');
  await win.waitForTimeout(250);
  const c1 = await caretInfo(win);
  // The first ArrowDown stays inside the wrapped item (same text span, deep
  // into it) instead of jumping to the next item.
  console.log('DOWN1:', JSON.stringify([c0, c1]));
  expect(c1.s).toBe(c0.s);
  expect(c1.o).toBeGreaterThan(50);

  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(250);
  const c2 = await caretInfo(win);
  // ArrowUp from the wrapped continuation line returns to the item's first
  // line, not to the previous item.
  console.log('UP1:', JSON.stringify(c2));
  expect(c2.s).toBe(c0.s);
  expect(c2.o).toBeLessThan(10);

  await win.keyboard.press('ArrowDown');
  await win.waitForTimeout(250);
  await win.keyboard.press('ArrowDown');
  await win.waitForTimeout(250);
  const c3 = await caretInfo(win);
  // Two more downs leave the item for the next one.
  console.log('DOWN2:', JSON.stringify(c3));
  expect(c3.s !== c0.s).toBe(true);

  // Typing on the wrapped continuation line edits inside the long item.
  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(250);
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(700);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  console.log('LINES:', JSON.stringify(lines));
  expect(lines.length).toBe(3);
  expect(lines[0]).toContain('X');
  expect(lines[1]).toBe('- second item');
  await app.close();
});
