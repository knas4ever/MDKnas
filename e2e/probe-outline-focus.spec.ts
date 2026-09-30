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

test('outline jump caret landing: raw vs rich', async () => {
  const base = '# A\n\nbody\n## B';
  const file = tempDoc(base);
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');

  // Raw mode: jump to "B", type Z -> where does Z land?
  await win.getByTitle('Toggle raw markdown / rich text view').click();
  await win.getByRole('button', { name: 'Outline' }).click();
  await win.getByRole('complementary').getByRole('button', { name: 'B' }).click();
  const diag = () =>
    win.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const t = el as HTMLTextAreaElement | null;
      return {
        tag: el?.tagName ?? '',
        selStart: t?.selectionStart ?? -1,
        valueLen: t?.value.length ?? -1
      };
    });
  console.log('after jump  :', JSON.stringify(await diag()));
  await win.keyboard.type('Z');
  console.log('after type  :', JSON.stringify(await diag()));
  const status = await win.locator('.border-t').first().textContent();
  console.log('status bar:', status);
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8') !== base, { timeout: 5000 });
  console.log('raw  :', JSON.stringify(fs.readFileSync(file, 'utf-8')));
  await win.waitForTimeout(3000);
  console.log('status 3s:', await win.locator('.border-t').first().textContent());
  console.log('file 3s  :', JSON.stringify(fs.readFileSync(file, 'utf-8')));

  // Rich mode: fresh file, jump to "B", type Z.
  const file2 = tempDoc(base);
  const app2 = await electron.launch({ args: ['.', '--open', file2] });
  const win2 = await app2.firstWindow();
  await win2.waitForSelector('.wysiwyg-root');
  await win2.getByRole('button', { name: 'Outline' }).click();
  await win2.getByRole('complementary').getByRole('button', { name: 'B' }).click();
  const diag2 = () =>
    win2.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { tag: el?.tagName ?? '', cls: el?.className ?? '' };
    });
  console.log('rich after jump :', JSON.stringify(await diag2()));
  await win2.keyboard.type('Z');
  console.log('rich after type :', JSON.stringify(await diag2()));
  console.log('rich box text  :', JSON.stringify(await win2.locator('.wysiwyg-root').textContent()));
  await win2.waitForTimeout(2000);
  console.log('rich file 3s  :', JSON.stringify(fs.readFileSync(file2, 'utf-8')));

  await app.close();
  await app2.close();
});
