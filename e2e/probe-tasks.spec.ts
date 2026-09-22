import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempDoc(initial: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-probe-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, initial);
  return file;
}

test('enter in task list continues with a task checkbox', async () => {
  const file = tempDoc('- [ ] one');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  const box = win.locator('.wysiwyg-root');
  await win.waitForSelector('.wysiwyg-root');
  await box.click();
  await win.keyboard.press('Control+End');
  await win.keyboard.press('Enter');
  await win.keyboard.type('two');
  await expect
    .poll(async () => fs.readFileSync(file, 'utf-8'), { timeout: 5000 })
    .toBe('- [ ] one\n- [ ] two');
  await app.close();
});

test('typing into an empty task item keeps the checkbox intact', async () => {
  const file = tempDoc('- [ ] ');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  const box = win.locator('.wysiwyg-root');
  await win.waitForSelector('.wysiwyg-root');
  // click on the task item (after the checkbox)
  await box.locator('li.task-item').last().click();
  await win.keyboard.type('abc');
  await win.waitForTimeout(1500);
  console.log('RESULT:', JSON.stringify(fs.readFileSync(file, 'utf-8')));
  await app.close();
});

test('line below a task list stays aligned inside the list', async () => {
  const file = tempDoc('- [ ] one\nplain text');
  const app = await electron.launch({ args: ['.', '--open', file] });
  const win = await app.firstWindow();
  const box = win.locator('.wysiwyg-root');
  await win.waitForSelector('.wysiwyg-root');
  const a = await box.getByText('one').boundingBox();
  const b = await box.getByText('plain text').boundingBox();
  console.log('BB a:', JSON.stringify(a), 'BB b:', JSON.stringify(b));
  const html = await box.innerHTML();
  console.log('HTML:', html);
  await app.close();
});
