import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { expectedSha256, isNewer, pickAsset, type ReleaseInfo } from './updateLogic';

const execFileAsync = promisify(execFile);
const LATEST_URL = 'https://api.github.com/repos/knas4ever/MDKnas/releases/latest';
const workDir = (): string => path.join(os.tmpdir(), 'mdknas-update');

let checking = false;

// The backup left by a previous update is only removed once the new version runs.
export function cleanupOldUpdate(): void {
  fs.rm(workDir(), { recursive: true, force: true }, () => undefined);
}

async function fetchLatest(): Promise<ReleaseInfo> {
  const res = await fetch(LATEST_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MDKnas-updater' }
  });
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  return (await res.json()) as ReleaseInfo;
}

async function download(url: string, dest: string, win: BrowserWindow | null): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'MDKnas-updater' } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  let received = 0;
  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.length;
    if (total && win && !win.isDestroyed()) win.setProgressBar(received / total);
  });
  try {
    await pipeline(source, fs.createWriteStream(dest));
  } finally {
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
  }
  return hash.digest('hex');
}

async function installWindows(zipPath: string): Promise<void> {
  const dir = workDir();
  const extracted = path.join(dir, 'new');
  const backup = path.join(dir, 'backup');
  const script = path.join(dir, 'apply-update.ps1');
  await execFileAsync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extracted.replace(/'/g, "''")}' -Force`
  ]);
  const installDir = path.dirname(process.execPath);
  if (!fs.existsSync(path.join(extracted, path.basename(process.execPath)))) {
    throw new Error('The downloaded update does not contain the application.');
  }
  // robocopy exit codes below 8 mean success; 8 or more triggers the rollback.
  fs.writeFileSync(
    script,
    [
      'param($ProcId, $Src, $Dst, $Bak, $Exe)',
      'Wait-Process -Id $ProcId -ErrorAction SilentlyContinue',
      'Start-Sleep -Seconds 1',
      'robocopy $Dst $Bak /MIR /R:5 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null',
      'robocopy $Src $Dst /E /IS /IT /R:30 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null',
      'if ($LASTEXITCODE -ge 8) { robocopy $Bak $Dst /MIR /R:5 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null }',
      'Start-Process -FilePath $Exe'
    ].join('\r\n')
  );
  spawn(
    'powershell.exe',
    [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script,
      String(process.pid), extracted, installDir, backup, process.execPath
    ],
    { detached: true, stdio: 'ignore', windowsHide: true }
  ).unref();
}

function installAppImage(downloaded: string, target: string): void {
  fs.chmodSync(downloaded, 0o755);
  // Same-directory rename is atomic; the running AppImage keeps its old inode.
  fs.renameSync(downloaded, target);
  // Starting a moment later lets this instance release the single-instance lock.
  spawn('sh', ['-c', 'sleep 1; exec "$0"', target], { detached: true, stdio: 'ignore' }).unref();
}

export async function checkForUpdates(win: BrowserWindow | null, manual: boolean): Promise<void> {
  if (checking) return;
  checking = true;
  let accepted = false;  const box = (options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> =>
    win && !win.isDestroyed() ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
  try {
    if (!app.isPackaged) {
      if (manual) await box({ type: 'info', message: 'Updates are only available in the packaged app.' });
      return;
    }
    const release = await fetchLatest();
    const current = app.getVersion();
    if (!isNewer(release.tag_name, current)) {
      if (manual) await box({ type: 'info', message: `MDKnas ${current} is up to date.` });
      return;
    }
    const latest = release.tag_name.replace(/^v/, '');
    const appImage = process.platform === 'linux' ? process.env.APPIMAGE : undefined;
    const asset = pickAsset(release.assets ?? [], process.platform, Boolean(appImage));

    if (!asset) {
      const r = await box({
        type: 'info',
        message: `MDKnas ${latest} is available (you have ${current}).`,
        detail: 'This installation cannot update itself. Open the download page?',
        buttons: ['Open download page', 'Later'],
        defaultId: 0,
        cancelId: 1
      });
      if (r.response === 0) void shell.openExternal(release.html_url);
      return;
    }

    const ask = await box({
      type: 'question',
      message: `MDKnas ${latest} is available (you have ${current}).`,
      detail: 'Download and install it now? The application will restart.',
      buttons: ['Update', 'Later'],
      defaultId: 0,
      cancelId: 1
    });
    if (ask.response !== 0) return;
    accepted = true;
    fs.rmSync(workDir(), { recursive: true, force: true });
    fs.mkdirSync(workDir(), { recursive: true });
    const dest = appImage ? `${appImage}.new` : path.join(workDir(), 'update.zip');
    const actual = await download(asset.browser_download_url, dest, win);
    const expected = expectedSha256(asset);
    if (expected && expected !== actual) {
      fs.rmSync(dest, { force: true });
      throw new Error('The downloaded file failed its integrity check.');
    }
    if (appImage) installAppImage(dest, appImage);
    else await installWindows(dest);
    app.quit();
  } catch (err) {
    if (manual || accepted) {
      await box({
        type: 'error',
        message: 'The update could not be completed.',
        detail: err instanceof Error ? err.message : String(err)
      });
    }
  } finally {
    checking = false;
  }
}
