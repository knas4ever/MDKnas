import { describe, expect, it } from 'vitest';
import { basename, dirname } from '../../src/lib/path';

describe('renderer path helpers', () => {
  it.each([
    ['C:\\notes\\document.md', 'C:\\notes', 'document.md'],
    ['/home/user/notes/document.md', '/home/user/notes', 'document.md']
  ])('handles platform paths: %s', (file, expectedDir, expectedBase) => {
    expect(dirname(file)).toBe(expectedDir);
    expect(basename(file)).toBe(expectedBase);
  });
});
