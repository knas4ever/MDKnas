import { test, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempDoc(initial: string, eol: '\n' | '\r\n'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdeditor-e2e-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, initial.replace(/\n/g, eol));
  return file;
}

function longDoc(): string {
  const lines: string[] = [];
  for (let i = 0; i < 60; i++) {
    if (i === 29) lines.push('## Target');
    else lines.push(`line ${i}`);
  }
  return lines.join('\n');
}

test('outline jump caret lands on heading text (raw + rich, LF + CRLF)', async () => {
  for (const eol of ['\n', '\r\n'] as const) {
    const file = tempDoc(longDoc(), eol);
    const app = await electron.launch({ args: ['.', '--open', file] });
    const win = await app.firstWindow();
    await win.waitForSelector('.wysiwyg-root');

    // Raw mode
    await win.getByTitle('Toggle raw markdown / rich text view').click();
    await win.getByRole('button', { name: 'Outline' }).click();
    await win.getByRole('complementary').getByRole('button', { name: 'Target' }).click();
    await win.keyboard.type('Z');
    await win.waitForTimeout(2500);
    let doc = fs.readFileSync(file, 'utf-8');
    let z = doc.indexOf('Z');
    console.log(eol === '\r\n' ? 'CRLF raw  ' : 'LF  raw  ', 'Z at', z, 'ok:', z === doc.indexOf('Target') - 1);

    // Rich mode (fresh file)
    const file2 = tempDoc(longDoc(), eol);
    const app2 = await electron.launch({ args: ['.', '--open', file2] });
    const win2 = await app2.firstWindow();
    await win2.waitForSelector('.wysiwyg-root');
    await win2.getByRole('button', { name: 'Outline' }).click();
    await win2.getByRole('complementary').getByRole('button', { name: 'Target' }).click();
    await win2.keyboard.type('Z');
    await win2.waitForTimeout(2500);
    doc = fs.readFileSync(file2, 'utf-8');
    z = doc.indexOf('Z');
    console.log(eol === '\r\n' ? 'CRLF rich ' : 'LF  rich ', 'Z at', z, 'ok:', z === doc.indexOf('Target') - 1);

    await app.close();
    await app2.close();
  }
});
