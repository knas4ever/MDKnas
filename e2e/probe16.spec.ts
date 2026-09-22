import { test, expect, _electron as electron } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const boot = async (name: string, text: string) => {
  const dir = '/tmp/p16';
  mkdirSync(dir, { recursive: true });
  const f = `${dir}/${name}`;
  writeFileSync(f, text);
  const app = await electron.launch({ args: ['.', '--open', f] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(500);
  return { app, win, f };
};

const domSel = (win: any) => win.evaluate(() => {
  const s = window.getSelection();
  if (!s || s.rangeCount === 0) return 'no sel';
  const n = s.anchorNode;
  const p = n && n.parentElement;
  return `N=${n && n.nodeName}[${p && p.getAttribute('data-s')},${p && p.getAttribute('data-e')}] o=${s.anchorOffset} blank=${!!(p && p.parentElement && p.parentElement.hasAttribute('data-blank-line'))}`;
});

// Click inside the span matching `selector` at horizontal fraction dx.
const clickSpan = async (win: any, selector: string, dx = 0.5) => {
  const r = await win.evaluate((sel2: string) => {
    const el = document.querySelector(sel2) as HTMLElement;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y + b.height / 2, w: b.width };
  }, selector);
  await win.mouse.click(r.x + r.w * dx, r.y);
};

test('blank line between blocks is reachable with ArrowDown/ArrowUp', async () => {
  const { app, win } = await boot('blank.md', 'para\n\n- [ ] task\n');
  await clickSpan(win, 'span[data-s="0"]', 0.3); // inside "para"
  await win.keyboard.press('ArrowDown');
  console.log('DOWN1:', await domSel(win));
  expect(await domSel(win)).toContain('blank=true'); // landed on the blank line
  await win.keyboard.press('ArrowDown');
  console.log('DOWN2:', await domSel(win));
  const d2 = await domSel(win);
  // "para\n\n- [ ] task\n": task text starts at 12
  expect(d2).toContain('[12,');
  expect(d2).not.toContain('blank=true');
  await win.keyboard.press('ArrowUp');
  console.log('UP1:', await domSel(win));
  expect(await domSel(win)).toContain('blank=true'); // back onto the blank line
  await app.close();
});

test('multiple blank lines are stepped through one at a time', async () => {
  // 'para' 0..3, blanks at 5, 6, 7, 'more' 8..11
  const { app, win } = await boot('multi.md', 'para\n\n\n\nmore\n');
  await clickSpan(win, 'span[data-s="0"]', 0.3); // inside "para"
  await win.keyboard.press('ArrowDown');
  expect(await domSel(win)).toContain('blank=true');
  await win.keyboard.press('ArrowDown');
  expect(await domSel(win)).toContain('blank=true');
  await win.keyboard.press('ArrowDown');
  expect(await domSel(win)).toContain('blank=true');
  await win.keyboard.press('ArrowDown');
  console.log('DOWN4:', await domSel(win));
  const d4 = await domSel(win);
  expect(d4).not.toContain('blank=true'); // now inside "more"
  expect(d4).toContain('[8,'); // "more" starts at 8
  await app.close();
});

test('ArrowDown through a task list keeps the horizontal position', async () => {
  const { app, win, f } = await boot('cols.md', '- [ ] task\n- [ ] task 2\n');
  await clickSpan(win, 'li span[data-s="6"]', 0.05); // caret at start of "task"
  await win.keyboard.press('ArrowDown');
  const d = await domSel(win);
  console.log('DOWN:', d);
  // "task 2" text starts at 17
  expect(d).toContain('[17,');
  expect(d).toContain('o=0');
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(400);
  const t = readFileSync(f, 'utf8');
  console.log('FILE:', JSON.stringify(t));
  expect(t.split('\n')[1]).toBe('- [ ] Xtask 2');
  await app.close();
});

test('ArrowUp from a list lands on the blank line, then the paragraph', async () => {
  const { app, win } = await boot('upblank.md', 'para\n\n- [ ] task\n');
  await clickSpan(win, 'li span[data-s="12"]', 0.3); // inside "task"
  await win.keyboard.press('ArrowUp');
  console.log('UP1:', await domSel(win));
  expect(await domSel(win)).toContain('blank=true');
  await win.keyboard.press('ArrowUp');
  console.log('UP2:', await domSel(win));
  const u2 = await domSel(win);
  expect(u2).not.toContain('blank=true');
  expect(u2).toContain('[0,'); // "para"
  await app.close();
});
