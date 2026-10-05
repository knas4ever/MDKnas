// Renderer-safe helpers for paths received from Electron, which use the
// platform separator rather than the browser's URL-style slash.
function separatorIndex(value: string): number {
  return Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
}

export function basename(value: string): string {
  return value.slice(separatorIndex(value) + 1);
}

export function dirname(value: string): string {
  const index = separatorIndex(value);
  return index < 0 ? '' : value.slice(0, index);
}
