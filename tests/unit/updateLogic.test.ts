import { describe, it, expect } from 'vitest';
import { expectedSha256, isNewer, pickAsset, RELEASE_DOWNLOAD_PREFIX } from '../../electron/updateLogic';

const asset = (name: string, digest?: string) => ({
  name,
  browser_download_url: `${RELEASE_DOWNLOAD_PREFIX}v2026.10.28/${name}`,
  digest
});

describe('update logic', () => {
  it('compares date versions numerically', () => {
    expect(isNewer('v2026.10.28', '2026.10.26')).toBe(true);
    expect(isNewer('2026.11.1', '2026.10.28')).toBe(true);
    expect(isNewer('2026.10.9', '2026.10.28')).toBe(false);
    expect(isNewer('2026.10.28', '2026.10.28')).toBe(false);
    expect(isNewer('garbage', '2026.10.28')).toBe(false);
  });

  it('picks the zip on Windows and the AppImage on Linux', () => {
    const assets = [
      asset('MDKnas-2026.10.28.AppImage'),
      asset('mdknas_2026.10.28_amd64.deb'),
      asset('MDKnas-2026.10.28-win-x64.zip')
    ];
    expect(pickAsset(assets, 'win32', false)?.name).toBe('MDKnas-2026.10.28-win-x64.zip');
    expect(pickAsset(assets, 'linux', true)?.name).toBe('MDKnas-2026.10.28.AppImage');
  });

  it('does not self-update a deb install or accept foreign URLs', () => {
    const assets = [asset('MDKnas-2026.10.28.AppImage')];
    expect(pickAsset(assets, 'linux', false)).toBeNull();
    const foreign = [{ name: 'x-win-x64.zip', browser_download_url: 'https://evil.example/x-win-x64.zip' }];
    expect(pickAsset(foreign, 'win32', false)).toBeNull();
  });

  it('reads the sha256 digest when present', () => {
    const hex = 'a'.repeat(64);
    expect(expectedSha256(asset('a.zip', `sha256:${hex}`))).toBe(hex);
    expect(expectedSha256(asset('a.zip'))).toBeNull();
  });
});
