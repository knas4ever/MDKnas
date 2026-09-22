import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempDoc(initial: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-e2e-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, initial);
  return file;
}

test('opens a file and renders live preview', async () => {
  const file = tempDoc('# Title\n\nhello **world**');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  const box = win.locator('.wysiwyg-root');
  await expect(box.locator('h1')).toHaveText('Title');
  await expect(box.locator('strong')).toHaveText('world');

  await box.click();
  await win.keyboard.press('End');
  await win.keyboard.type(' more');
  await expect(box).toContainText('more');

  await app.close();
});

test('bold shortcut wraps the selection', async () => {
  const file = tempDoc('plain text');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('Control+a');
  await win.keyboard.press('Control+b');
  await expect(box.locator('strong')).toHaveText('plain text');

  await app.close();
});

test('enter at end of line starts a new line', async () => {
  const file = tempDoc('line one');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('End');
  await win.keyboard.press('Enter');
  await win.keyboard.type('line two');

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toContain('line one\nline two');

  await app.close();
});

test('outline lists headings and autosave writes to disk', async () => {
  const file = tempDoc('# One\n\nbody\n\n## Two');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  await win.getByRole('button', { name: 'Outline' }).click();
  await expect(win.getByRole('button', { name: 'One' })).toBeVisible();
  await expect(win.getByRole('button', { name: 'Two' })).toBeVisible();

  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('Control+End');
  await win.keyboard.type(' saved');

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toContain('saved');

  await app.close();
});

test('bullet list continues on new lines', async () => {
  const file = tempDoc('- a');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('End');
  await win.keyboard.press('Enter');
  await win.keyboard.type('b');
  await win.keyboard.press('Enter');
  await win.keyboard.type('c');

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('- a\n- b\n- c');

  await app.close();
});

test('ordered list continues and increments numbers', async () => {
  const file = tempDoc('1. a');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('End');
  await win.keyboard.press('Enter');
  await win.keyboard.type('b');
  await win.keyboard.press('Enter');
  await win.keyboard.type('c');

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('1. a\n2. b\n3. c');

  await app.close();
});

test('rich view shows list markers and blank lines', async () => {
  const file = tempDoc('1. one\n2. two\n\n- a\n- b\n\nabc\n\ndef');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  const olStyle = await win
    .locator('.wysiwyg-root ol')
    .first()
    .evaluate(el => getComputedStyle(el).listStyleType);
  const ulStyle = await win
    .locator('.wysiwyg-root ul')
    .first()
    .evaluate(el => getComputedStyle(el).listStyleType);
  const box = win.locator('.wysiwyg-root');
  const html = await box.innerHTML();

  expect(olStyle).toBe('decimal');
  expect(html).toContain('data-blank-line');
  // each blank source line is a visible line containing &nbsp;
  // (Chromium serializes U+00A0 as &nbsp; in innerHTML)
  expect(html).toContain('<span data-s="14" data-e="15">&nbsp;</span>');
  expect(html).toContain('<span data-s="23" data-e="24">&nbsp;</span>');
  expect(html).toContain('<span data-s="28" data-e="29">&nbsp;</span>');

  await app.close();
});

test('enter in a mid-document list creates a new item on the correct line', async () => {
  const file = tempDoc('1. one\n2. two\n\n- a\n- b\n- c');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  const box = win.locator('.wysiwyg-root');
  await win.waitForSelector('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('Control+End');

  await win.keyboard.press('Enter');
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('1. one\n2. two\n\n- a\n- b\n- c\n- ');

  // The ul has four items, each a single visual line — no phantom gap line
  // between items, and the caret sits on the new (fourth) line.
  const layout = await box.evaluate(el => {
    const rootRect = el.getBoundingClientRect();
    const lis = Array.from(el.querySelector('ul')!.querySelectorAll('li')).map(li => {
      const r = li.getBoundingClientRect();
      return { top: Math.round(r.top - rootRect.top), height: Math.round(r.height) };
    });
    const sel = window.getSelection()!;
    const range = el.ownerDocument.createRange();
    range.setStart(sel.anchorNode, sel.anchorOffset);
    range.setEnd(sel.focusNode, sel.focusOffset);
    const caret = range.getBoundingClientRect();
    return { lis, caretY: Math.round(caret.top - rootRect.top) };
  });
  expect(layout.lis).toHaveLength(4);
  for (const li of layout.lis) expect(li.height).toBeLessThan(40);
  expect(layout.caretY).toBeGreaterThanOrEqual(layout.lis[3].top);

  await win.keyboard.type('d');
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('1. one\n2. two\n\n- a\n- b\n- c\n- d');

  await app.close();
});

test('raw MD toggle shows the markdown source', async () => {
  const file = tempDoc('# Title\n\nhello **world**');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  await win.getByTitle('Toggle raw markdown / rich text view').click();
  const ta = win.locator('textarea.source-view');
  await expect(ta).toBeVisible();
  await expect(ta).toHaveValue('# Title\n\nhello **world**');

  // editing the source updates the document
  await ta.click();
  await win.keyboard.press('Control+End');
  await win.keyboard.type(' raw');
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toContain('raw');

  // switching back restores the rich view with the caret kept
  await win.getByTitle('Toggle raw markdown / rich text view').click();
  await expect(win.locator('.wysiwyg-root')).toBeVisible();

  await app.close();
});

test('numbered list marks every line of a multi-line selection', async () => {
  const file = tempDoc('a\nb');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  const box = win.locator('.wysiwyg-root');
  await win.waitForSelector('.wysiwyg-root');
  await box.click();

  // Select both lines: caret to start, then extend over the second line.
  await win.keyboard.press('Control+Home');
  await win.keyboard.down('Shift');
  await win.keyboard.press('ArrowDown');
  await win.keyboard.press('Shift+End');
  await win.keyboard.up('Shift');

  await win.getByRole('button', { name: '1.' }).click();
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('1. a\n2. b');

  await app.close();
});

test('starting without a file gives an untitled document and Ctrl+N clears it', async () => {
  const app = await electron.launch({ args: ['.'] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  expect(await win.getByText('Untitled (Ctrl+S to save)').count()).toBe(1);

  await win.locator('.wysiwyg-root').click();
  await win.keyboard.type('hello world');
  await win.keyboard.press('Control+n');
  expect(await win.locator('.wysiwyg-root').innerText()).toBe('');

  await app.close();
});

test('three consecutive enters create three new lines', async () => {
  const file = tempDoc('abc');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('End');
  await win.keyboard.press('Enter');
  await win.keyboard.press('Enter');
  await win.keyboard.press('Enter');

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('abc\n\n\n');

  await app.close();
});

test('link button opens a URL prompt and inserts the link', async () => {
  const file = tempDoc('hello');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  const box = win.locator('.wysiwyg-root');
  await box.click();

  await win.getByRole('button', { name: 'Link' }).click();
  const dialog = win.getByRole('dialog', { name: 'Link URL' });
  const input = dialog.locator('input');
  await input.fill('https://example.com');
  await input.press('Enter');

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('[hello](https://example.com)');

  await app.close();
});

test('table button inserts a table of the requested size', async () => {
  const file = tempDoc('x');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  const box = win.locator('.wysiwyg-root');
  await box.click();

  await win.getByRole('button', { name: 'Table' }).click();
  const dialog = win.getByRole('dialog', { name: 'Insert table' });
  await dialog.getByLabel('Rows').fill('2');
  await dialog.getByLabel('Columns').fill('3');
  await dialog.getByRole('button', { name: 'Insert' }).click();

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe(
      '| Column 1 | Column 2 | Column 3 |\n' +
        '| --- | --- | --- |\n' +
        '|    |    |    |'
    );

  await app.close();
});

test('code block shows a copy button that copies on click', async () => {
  const file = tempDoc('```js\nlet x = 1\n```');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  const box = win.locator('.wysiwyg-root');
  await expect(box.locator('.codeblock')).toHaveCount(1);
  await expect(box.locator('code')).toHaveText('let x = 1');

  const copy = box.locator('.code-copy');
  await copy.click();
  await expect(copy).toHaveText('Copied');

  await app.close();
});

test('pasting text persists in the document', async () => {
  const file = tempDoc('start');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('Control+End');

  await app.evaluate(({ clipboard }) => clipboard.writeText(' pasted'));
  await win.keyboard.press('Control+v');

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('start pasted');

  await app.close();
});

test('empty table cells are clickable and editable', async () => {
  const file = tempDoc('| Column 1 | Column 2 |\n| --- | --- |\n|    |    |');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  const box = win.locator('.wysiwyg-root');
  await expect(box.locator('td')).toHaveCount(2);

  await box.locator('td').nth(0).click();
  await win.keyboard.type('hi');

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('| Column 1 | Column 2 |\n| --- | --- |\n|hi    |    |');

  await app.close();
});

test('typing into a non-empty table cell stays inside the cell', async () => {
  const file = tempDoc('para\n\n| a | b |\n|---|---|\n|    |    |');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(1500);

  const box = win.locator('.wysiwyg-root');
  await box.locator('th').first().click();
  await win.keyboard.type('!');
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toMatch(/^para\n\n\| [a!]+ \| b \|/);

  await app.close();
});

test('clicking a task-list checkbox checks the task', async () => {
  const file = tempDoc('- [ ] task');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(1500);

  const box = win.locator('.wysiwyg-root');
  await box.locator('input[type="checkbox"]').click();
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('- [x] task');

  await app.close();
});

test('copying and pasting inside the app keeps formatting as markdown', async () => {
  const file = tempDoc('abc');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(1500);

  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('Control+a');
  await win.keyboard.press('Control+b');
  await win.keyboard.press('Control+a');
  await win.keyboard.press('Control+c');
  await win.keyboard.press('End');
  await win.keyboard.press('Control+v');

  await expect
    .poll(async () => {
      const f = fs.readFileSync(file, 'utf-8');
      return (f.match(/\*\*abc\*\*/g) ?? []).length;
    }, { timeout: 5000 })
    .toBe(2);

  await app.close();
});

test('copying raw markdown and pasting it back preserves formatting', async () => {
  const doc = '# T\n\n- [ ] task\n\n| a | b |\n|---|---|\n| 1 | 2 |';
  const file = tempDoc(doc);
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(1500);

  const box = win.locator('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('Control+a');
  await win.keyboard.press('Control+c');
  await win.keyboard.press('End');
  await win.keyboard.press('Control+v');

  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe(doc + doc);

  await app.close();
});

test('typing into an empty code block inserts at the fence content', async () => {
  const file = tempDoc('```\n```');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(1500);

  const box = win.locator('.wysiwyg-root');
  await box.locator('pre').first().click();
  await win.keyboard.type('X');
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('```\nX\n```');

  await app.close();
});

test('clicking below the content in a code block does not corrupt the fence', async () => {
  const file = tempDoc('```\nZ\n```');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(1500);

  const pre = win.locator('.wysiwyg-root pre').first();
  const b = (await pre.boundingBox())!;
  // Click in the empty area BELOW the "Z" line (previously an invisible
  // gap line holding the closing fence marker).
  await win.mouse.click(b.x + 60, b.y + b.height - 6);
  await win.keyboard.type('Q');
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('```\nZQ\n```');

  await app.close();
});

test('drag and drop an image saves it to the assets folder and inserts markdown', async () => {
  const file = tempDoc('# hi\n');
  const dir = path.dirname(file);
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(1500);

  // Click into the text so the caret is inside the document.
  await win.locator('.wysiwyg-root').getByText('hi').click();

  // 1x1 PNG, dropped via a synthetic DataTransfer.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURQECA////wbwsPYAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gkSFTccEuDywQAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wOS0xOFQyMTo1NToyOCswMDowMI7XxpcAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDktMThUMjE6NTU6MjgrMDA6MDD/in4rAAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA5LTE4VDIxOjU1OjI4KzAwOjAwqJ9f9AAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=',
    'base64'
  );
  await win.evaluate((b64: string) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'probe.png', { type: 'image/png' }));
    const el = document.querySelector('.wysiwyg-root') as HTMLElement;
    el.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })
    );
  }, png.toString('base64'));

  await expect
    .poll(() => fs.existsSync(path.join(dir, 'doc_assets', 'probe.png')), { timeout: 5000 })
    .toBe(true);
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toContain('![probe.png](doc_assets/probe.png)');
  await expect.poll(() => win.locator('.wysiwyg-root img').count(), { timeout: 5000 }).toBe(1);
  const img = win.locator('.wysiwyg-root img');
  await expect
    .poll(async () => img.evaluate((el) => el.naturalWidth), { timeout: 5000 })
    .toBeGreaterThan(0);

  await app.close();
});

test('file changed on disk reloads automatically without re-opening', async () => {
  const file = tempDoc('before');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await expect(win.locator('.wysiwyg-root')).toContainText('before');

  // Edit the file externally (in-place write fires fs 'change').
  fs.writeFileSync(file, 'after change');

  await expect
    .poll(async () => {
      return (await win.locator('.wysiwyg-root').innerText()).includes('after change');
    }, { timeout: 5000 })
    .toBe(true);

  await app.close();
});

test('folder flow: file open from sidebar reloads when edited externally', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-e2e-'));
  fs.writeFileSync(path.join(dir, 'a.md'), 'alpha');
  fs.writeFileSync(path.join(dir, 'b.md'), 'beta');
  const app = await electron.launch({ args: ['.', '--open-folder', dir] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  await win.getByRole('button', { name: 'a.md' }).click();
  await expect(win.locator('.wysiwyg-root')).toContainText('alpha');

  fs.writeFileSync(path.join(dir, 'a.md'), 'alpha changed');

  await expect
    .poll(async () => (await win.locator('.wysiwyg-root').innerText()).includes('alpha changed'), { timeout: 5000 })
    .toBe(true);

  await app.close();
});

test('subfolder file reloads on external edit', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-e2e-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'a.md'), 'alpha');
  const app = await electron.launch({ args: ['.', '--open-folder', dir] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.getByRole('button', { name: 'a.md' }).click();
  await expect(win.locator('.wysiwyg-root')).toContainText('alpha');
  fs.writeFileSync(path.join(dir, 'sub', 'a.md'), 'alpha changed');
  await expect
    .poll(async () => (await win.locator('.wysiwyg-root').innerText()).includes('alpha changed'), { timeout: 5000 })
    .toBe(true);
  await app.close();
});

test('external edit via temp-file+rename reloads the doc', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-e2e-'));
  fs.writeFileSync(path.join(dir, 'a.md'), 'alpha');
  const app = await electron.launch({ args: ['.', '--open-folder', dir] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.getByRole('button', { name: 'a.md' }).click();
  await expect(win.locator('.wysiwyg-root')).toContainText('alpha');
  // vim-style save: write to temp file, rename over the original
  fs.writeFileSync(path.join(dir, 'a.md.tmp'), 'alpha changed');
  fs.renameSync(path.join(dir, 'a.md.tmp'), path.join(dir, 'a.md'));
  await expect
    .poll(async () => (await win.locator('.wysiwyg-root').innerText()).includes('alpha changed'), { timeout: 5000 })
    .toBe(true);
  await app.close();
});
