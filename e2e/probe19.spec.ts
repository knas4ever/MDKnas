import { test, expect, _electron as electron } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const MD = [
  '- **Prompt**: 21 tokens ("Write a Python function to calculate fibonacci numbers iteratively.")',
  '- **Generation**: 200 tokens max',
  '- **VRAM**: measured during/after generation via `rocm-smi --showmeminfo vram`',
  '- **RAM**: measured via `free -h` on host',
  '- **MTP**: Multi-Token Prediction (speculative decoding)',
  '- **Date**: 2026-05-21 (fresh container rebuild)',
  ''
].join('\n');

const boot = async (name: string, text: string) => {
  const dir = '/tmp/p19';
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
    o: s.anchorOffset,
    x: r.left ? Math.round(r.left) : null
  };
});

test('ArrowUp/Down inside a bold-led list keeps the column', async () => {
  const { app, win, f } = await boot('bold.md', MD);
  // Click well right of the leading "**VRAM**" bold
  const r = await win.evaluate(() => {
    const b = document.querySelector('li:nth-child(3)').getBoundingClientRect();
    return { x: b.left + 120, y: b.top + b.height / 2 };
  });
  await win.mouse.click(r.x, r.y);
  await win.waitForTimeout(300);
  const c0 = await caretInfo(win);
  expect(c0).toBeTruthy();

  // Up must not clip to the end of the bold in the line above: the caret
  // stays at the same screen column.
  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(300);
  const c1 = await caretInfo(win);
  console.log('UP:', JSON.stringify([c0, c1]));
  expect(Math.abs(c1.x - c0.x)).toBeLessThanOrEqual(6);

  // Down returns the caret to the exact source position it left.
  await win.keyboard.press('ArrowDown');
  await win.waitForTimeout(300);
  const c2 = await caretInfo(win);
  console.log('DOWN:', JSON.stringify(c2));
  expect(c2.s).toBe(c0.s);
  expect(c2.o).toBe(c0.o);

  // Typing after crossing lines inserts in the right line, right of the bold.
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  const t = readFileSync(f, 'utf8');
  console.log('FILE:', JSON.stringify(t));
  expect(t.split('\n')[2]).toContain('measureXd during');
  await app.close();
});

test('walking up a bold-led list keeps the column the whole way', async () => {
  const { app, win } = await boot('bold3.md', MD);
  const r = await win.evaluate(() => {
    const b = document.querySelector('li:nth-child(6)').getBoundingClientRect();
    return { x: b.left + 120, y: b.top + b.height / 2 };
  });
  await win.mouse.click(r.x, r.y);
  await win.waitForTimeout(300);
  const c0 = await caretInfo(win);
  const xs: number[] = [];
  for (let i = 0; i < 5; i++) {
    await win.keyboard.press('ArrowUp');
    await win.waitForTimeout(200);
    xs.push((await caretInfo(win)).x);
  }
  console.log('UPWALK:', JSON.stringify([c0.x, xs]));
  expect(xs.every((x) => Math.abs(x - c0.x!) <= 8)).toBe(true);
  await app.close();
});

test('ArrowUp into a bold-led item types right of the bold, not inside it', async () => {
  const { app, win, f } = await boot('bold2.md', MD);
  const r = await win.evaluate(() => {
    const b = document.querySelector('li:nth-child(3)').getBoundingClientRect();
    return { x: b.left + 120, y: b.top + b.height / 2 };
  });
  await win.mouse.click(r.x, r.y);
  await win.waitForTimeout(300);
  await win.keyboard.press('ArrowUp');
  await win.waitForTimeout(300);
  await win.keyboard.type('X');
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(500);
  const t = readFileSync(f, 'utf8');
  console.log('FILE2:', JSON.stringify(t));
  // X belongs to the Generation line, past its bold label
  expect(t.split('\n')[1]).toBe('- **Generation**: 200X tokens max');
  expect(t.split('\n')[2]).toBe('- **VRAM**: measured during/after generation via `rocm-smi --showmeminfo vram`');
  await app.close();
});
