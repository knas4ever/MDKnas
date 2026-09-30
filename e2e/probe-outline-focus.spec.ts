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

test('outline jump in raw MD scrolls the textarea to the heading', async () => {
  const body = Array.from({ length: 200 }, () => 'lorem ipsum dolor').join('\n');
  const file = tempDoc('# One\n\n' + body + '\n\n## Two');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  await win.getByTitle('Toggle raw markdown / rich text view').click();
  const ta = win.locator('textarea.source-view');
  await win.getByRole('button', { name: 'Outline' }).click();
  await win.getByRole('button', { name: 'Two' }).click();

  const info = await win.evaluate(() => {
    const t = document.activeElement as HTMLTextAreaElement | null;
    return {
      tag: t?.tagName ?? '',
      selStart: t?.selectionStart ?? -1,
      scrollTop: t?.scrollTop ?? -1,
      scrollHeight: t?.scrollHeight ?? -1,
      clientHeight: t?.clientHeight ?? -1
    };
  });
  console.log('after jump:', JSON.stringify(info));

  // The caret is on the last line: the textarea must have scrolled down.
  expect(info.scrollTop).toBeGreaterThan(0);

  // Typing must land at the heading.
  await win.keyboard.type('Z');
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toContain('ZTwo');

  await app.close();
});
