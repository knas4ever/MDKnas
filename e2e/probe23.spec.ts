import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PNG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function tempDoc(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdknas-img-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, content);
  return file;
}

const launch = async (file: string) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mdknas-profile-'));
  return electron.launch({ args: ['.', '--open', file, `--user-data-dir=${profile}`] });
};

test('right-click an image and type a percentage resizes it', async () => {
  const file = tempDoc(`![dot](${PNG})\n`);
  const app = await launch(file);
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(500);
  const img = win.locator('img.md-img').first();
  await img.click({ button: 'right' });
  await win.waitForTimeout(400);
  const menu = win.locator('.image-menu');
  await expect(menu).toBeVisible();
  await menu.locator('input').first().waitFor();
  await win.keyboard.type('40');
  await win.waitForTimeout(200);
  await win.keyboard.press('Enter');
  await win.waitForTimeout(600);
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(700);
  const t = fs.readFileSync(file, 'utf8');
  console.log('FILE:', JSON.stringify(t));
  expect(t).toBe(`![dot](${PNG}){width=40%}\n`);
  const style = await win.evaluate(() => document.querySelector('img.md-img')?.getAttribute('style') ?? '');
  console.log('STYLE:', JSON.stringify(style));
  expect(style).toBe('width:40%');
  await app.close();
});

test('a sized image may grow past the text column', async () => {
  const file = tempDoc(`![dot](${PNG})\n`);
  const app = await launch(file);
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(500);
  await win.locator('img.md-img').first().click({ button: 'right' });
  await win.waitForTimeout(400);
  const menu = win.locator('.image-menu');
  await expect(menu).toBeVisible();
  await menu.locator('input').first().waitFor();
  await win.keyboard.type('150');
  await win.waitForTimeout(200);
  await win.keyboard.press('Enter');
  await win.waitForTimeout(600);
  const sizes = await win.evaluate(() => {
    const img = document.querySelector('img.md-img') as HTMLElement;
    const root = document.querySelector('.wysiwyg-root') as HTMLElement;
    const ib = img.getBoundingClientRect();
    const rb = root.getBoundingClientRect();
    return {
      img: Math.round(ib.width),
      root: Math.round(rb.width),
      // The editor must sit flush against its scroll container: no dead space
      // on the left, so an enlarged image has room to grow to the right.
      rootLeft: Math.round(rb.left),
      boxLeft: Math.round(root.parentElement!.getBoundingClientRect().left),
      style: img.getAttribute('style') ?? ''
    };
  });
  console.log('SIZED:', JSON.stringify(sizes));
  expect(sizes.style).toBe('width:150%');
  expect(sizes.img > sizes.root).toBe(true);
  // The column is left-aligned, so the enlarged image has room to grow into
  // instead of being centred with dead space on both sides.
  expect(Math.abs(sizes.rootLeft - sizes.boxLeft)).toBeLessThanOrEqual(2);
  await app.close();
});

test('backspace removes the whole image including its size attribute', async () => {
  const file = tempDoc(`x ![dot](${PNG}){width=40%} y\n`);
  const app = await launch(file);
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(500);
  // Caret just after the image's attribute block, then Backspace must delete
  // the whole unit, not one character at a time.
  const r = await win.evaluate(() => {
    const wrap = document.querySelector('.img-wrap') as HTMLElement;
    const b = wrap.getBoundingClientRect();
    return { x: b.right + 1, y: b.top + b.height / 2 };
  });
  await win.mouse.click(r.x, r.y);
  await win.waitForTimeout(300);
  await win.keyboard.press('Backspace');
  await win.waitForTimeout(400);
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(700);
  const t = fs.readFileSync(file, 'utf8');
  console.log('FILE3:', JSON.stringify(t));
  expect(t).toBe('x  y\n');
  await app.close();
});

test('right-click 100% removes the size attribute', async () => {
  const file = tempDoc(`![dot](${PNG}){width=40%}\n`);
  const app = await launch(file);
  const win = await app.firstWindow();
  await win.waitForSelector('.wysiwyg-root');
  await win.waitForTimeout(500);
  await win.locator('img.md-img').first().click({ button: 'right' });
  await win.waitForTimeout(400);
  const menu = win.locator('.image-menu');
  await expect(menu).toBeVisible();
  await menu.locator('input').first().waitFor();
  await win.keyboard.type('100');
  await win.waitForTimeout(200);
  await win.keyboard.press('Enter');
  await win.waitForTimeout(600);
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(700);
  const t = fs.readFileSync(file, 'utf8');
  console.log('FILE2:', JSON.stringify(t));
  expect(t).toBe(`![dot](${PNG})\n`);
  const style2 = await win.evaluate(() => document.querySelector('img.md-img')?.getAttribute('style') ?? '');
  console.log('STYLE2:', JSON.stringify(style2));
  expect(style2).toBe('');
  await app.close();
});
