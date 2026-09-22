import { test, expect, _electron } from '@playwright/test';
import { writeFileSync, renameSync, readFileSync } from 'node:fs';

const domSel = (win) => win.evaluate(() => {
  const s = window.getSelection();
  if (!s || s.rangeCount === 0) return 'no sel';
  const n = s.anchorNode;
  const p = n && n.parentElement;
  return `N=${n && n.nodeName}[${p && p.getAttribute('data-s')},${p && p.getAttribute('data-e')}] o=${s.anchorOffset} parent=${p && p.tagName}`;
});

// Regression: the buggy behaviour landed the caret on the [0,2] gap at the
// very start of the document.
const notDocStart = async (win) => {
  const sel = await domSel(win);
  expect(sel).not.toBe('no sel');
  const m = sel.match(/\[(\d+),\d+\]/);
  expect(m && Number(m[1]) !== 0).toBe(true);
};

async function boot(file: string, content: string) {
  const app = await _electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(700);
  return { app, win };
}

test('ArrowDown variants', async () => {
  // 1. blank line between paragraph and list
  writeFileSync('/tmp/p13a.md', '# Heading\nsome paragraph\n\n- [ ] task\n- [ ] task 2\n');
  {
    const { app, win } = await boot('/tmp/p13a.md', '');
    await win.locator('.wysiwyg-root p span').first().click();
    console.log('A START:', await domSel(win));
    await win.keyboard.press('ArrowDown');
    console.log('A DOWN1:', await domSel(win));
    await win.keyboard.press('ArrowDown');
    console.log('A DOWN2:', await domSel(win));
    await notDocStart(win);
    await app.close();
  }
  // 2. multi-line paragraph, caret at o=0
  writeFileSync('/tmp/p13b.md', '# Heading\npara line one\npara line two\n- [ ] task\n');
  {
    const { app, win } = await boot('/tmp/p13b.md', '');
    await win.locator('.wysiwyg-root p').first().click({ position: { x: 5, y: 10 } });
    console.log('B START:', await domSel(win));
    await win.keyboard.press('ArrowDown');
    console.log('B DOWN1:', await domSel(win));
    await win.keyboard.press('ArrowDown');
    console.log('B DOWN2:', await domSel(win));
    await notDocStart(win);
    await app.close();
  }
  // 3. bold first item, caret at o=0 of paragraph
  writeFileSync('/tmp/p13c.md', 'intro text\n- [ ] **bold task**\n- [ ] task 2\n');
  {
    const { app, win } = await boot('/tmp/p13c.md', '');
    await win.locator('.wysiwyg-root p span').first().click({ position: { x: 2, y: 8 } });
    console.log('C START:', await domSel(win));
    await win.keyboard.press('ArrowDown');
    console.log('C DOWN1:', await domSel(win));
    await notDocStart(win);
    await app.close();
  }
  // 4. list is the FIRST block, then a paragraph; down across the list end
  writeFileSync('/tmp/p13d.md', '- [ ] task\n- [ ] task 2\n\npara after\n');
  {
    const { app, win } = await boot('/tmp/p13d.md', '');
    await win.locator('.wysiwyg-root li').first().locator('span:not([data-gap])').first().click();
    console.log('D START:', await domSel(win));
    await win.keyboard.press('ArrowDown');
    console.log('D DOWN1:', await domSel(win));
    await win.keyboard.press('ArrowDown');
    console.log('D DOWN2:', await domSel(win));
    await notDocStart(win);
    await app.close();
  }
});

test('vim-style atomic save reloads', async () => {
  const f = '/tmp/p13v.md';
  writeFileSync(f, 'v1 line one\n');
  const { app, win } = await boot(f, '');
  const before = await win.evaluate(() => document.querySelector('.wysiwyg-root')!.textContent);
  // vim-style: write temp file, rename over original
  const tmp = f + '.swp';
  writeFileSync(tmp, 'v2 line one changed\n');
  renameSync(tmp, f);
  await win.waitForTimeout(1500);
  const after = await win.evaluate(() => document.querySelector('.wysiwyg-root')!.textContent);
  console.log('RELOAD before:', JSON.stringify(before), 'after:', JSON.stringify(after));
  expect(after).toContain('v2 line one changed');
  await app.close();
});

test('in-place save of open file reloads', async () => {
  const f = '/tmp/p13i.md';
  writeFileSync(f, 'alpha\n');
  const app = await _electron.launch({ args: ['.', '--open', f] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(700);
  writeFileSync(f, 'alpha beta\n');
  await win.waitForTimeout(1500);
  const after = await win.evaluate(() => document.querySelector('.wysiwyg-root')!.textContent);
  console.log('INPLACE after:', JSON.stringify(after));
  expect(after).toContain('alpha beta');
  await app.close();
});
test('file in subfolder of open root reloads', async () => {
  const dir = '/tmp/p13s';
  require('node:fs').mkdirSync(dir + '/a', { recursive: true });
  writeFileSync(dir + '/a/b.md', 'sub one\n');
  const app = await _electron.launch({ args: ['.', '--open-folder', dir] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(700);
  await win.getByText('b.md').first().click();
  await win.waitForSelector('.wysiwyg-root span');
  writeFileSync(dir + '/a/b.md', 'sub two changed\n');
  await win.waitForTimeout(1500);
  const after = await win.evaluate(() => document.querySelector('.wysiwyg-root')!.textContent);
  console.log('SUB after:', JSON.stringify(after));
  expect(after).toContain('sub two changed');
  await app.close();
});
