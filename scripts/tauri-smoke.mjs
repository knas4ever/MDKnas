// CI smoke test for the Tauri build: launches the exe, drives the WebView2 over CDP, saves screenshots.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const exe = path.resolve(process.argv[2]);
const out = path.resolve('tauri-smoke');
mkdirSync(out, { recursive: true });
const doc = path.join(out, 'sample.md');
writeFileSync(doc, '# Title\n\nHello wrold this is a tset of the speling.\n');

const shot = name =>
  execFileSync('powershell', ['-NoProfile', '-Command', `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b=[System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)
$bmp.Save('${path.join(out, name)}')`]);

const log = [];
const step = async (name, fn) => {
  try { log.push(`${name}: ${JSON.stringify(await fn())}`); }
  catch (e) { log.push(`${name}: FAIL ${e.message.split('\n')[0]}`); }
};

const proc = spawn(exe, ['--open', doc], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222' },
  stdio: 'ignore'
});

try {
  let browser;
  for (let i = 0; i < 40 && !browser; i++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); }
    catch { await new Promise(r => setTimeout(r, 1000)); }
  }
  if (!browser) throw new Error('could not attach to WebView2');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForTimeout(3000);

  await step('hasApi', () => page.evaluate(() => typeof window.api));
  await step('about', () => page.evaluate(async () => (await window.api.getAbout()).version));
  const editor = page.locator('[contenteditable="true"]').first();
  await step('editorText', async () => (await editor.innerText()).slice(0, 80));
  await step('spellcheckAttr', () => editor.evaluate(e => ({ attr: e.getAttribute('spellcheck'), prop: e.spellcheck })));

  await editor.click();
  await page.waitForTimeout(2500);
  shot('1-opened-clicked.png');

  await page.keyboard.press('End');
  await page.keyboard.type(' mispeled werd ', { delay: 30 });
  await page.waitForTimeout(2500);
  shot('2-typed.png');

  await step('dblclickSelection', async () => {
    await page.getByText('Hello', { exact: false }).first().dblclick();
    return page.evaluate(() => JSON.stringify(window.getSelection().toString()));
  });
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(1500);
  shot('3-bold.png');
  await step('afterBold', async () => (await editor.innerHTML()).slice(0, 200));
} catch (e) {
  log.push(`FATAL ${e.message}`);
} finally {
  writeFileSync(path.join(out, 'log.txt'), log.join('\n'));
  console.log(log.join('\n'));
  proc.kill();
}
