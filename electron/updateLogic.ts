export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  digest?: string | null;
}

export interface ReleaseInfo {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export const RELEASE_DOWNLOAD_PREFIX = 'https://github.com/knas4ever/MDKnas/releases/download/';

export function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+(?:\.\d+)*)$/.exec(v.trim());
  return m ? m[1].split('.').map(Number) : null;
}

// Versions are build dates (YYYY.M.D), compared numerically part by part.
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export function pickAsset(
  assets: ReleaseAsset[],
  platform: NodeJS.Platform,
  isAppImage: boolean
): ReleaseAsset | null {
  const suffix = platform === 'win32' ? '-win-x64.zip' : platform === 'linux' && isAppImage ? '.AppImage' : null;
  if (!suffix) return null;
  const asset = assets.find(
    a => a.name.endsWith(suffix) && a.browser_download_url.startsWith(RELEASE_DOWNLOAD_PREFIX)
  );
  return asset ?? null;
}

export function expectedSha256(asset: ReleaseAsset): string | null {
  const m = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? '');
  return m ? m[1].toLowerCase() : null;
}
