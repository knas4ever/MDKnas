export interface Selection {
  start: number;
  end: number;
}

export type EditorAction =
  | 'bold'
  | 'italic'
  | 'code'
  | 'link'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'quote';

const PAIR_MAP: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '*': '*',
  '`': '`'
};

export function getLine(content: string, pos: number): { start: number; end: number; text: string } {
  const start = content.lastIndexOf('\n', pos - 1) + 1;
  let end = content.indexOf('\n', pos);
  if (end === -1) end = content.length;
  return { start, end, text: content.slice(start, end) };
}

export function insertText(
  content: string,
  sel: Selection,
  text: string
): { content: string; selection: Selection } {
  const next = content.slice(0, sel.start) + text + content.slice(sel.end);
  return { content: next, selection: { start: sel.start + text.length, end: sel.start + text.length } };
}

export function backspace(content: string, sel: Selection): { content: string; selection: Selection } {
  if (sel.start !== sel.end) {
    return {
      content: content.slice(0, sel.start) + content.slice(sel.end),
      selection: { start: sel.start, end: sel.start }
    };
  }
  if (sel.start === 0) return { content, selection: sel };
  const at = sel.start - 1;
  return { content: content.slice(0, at) + content.slice(sel.start), selection: { start: at, end: at } };
}

export function deleteForward(content: string, sel: Selection): { content: string; selection: Selection } {
  if (sel.start !== sel.end) {
    return {
      content: content.slice(0, sel.start) + content.slice(sel.end),
      selection: { start: sel.start, end: sel.start }
    };
  }
  if (sel.start >= content.length) return { content, selection: sel };
  return { content: content.slice(0, sel.start) + content.slice(sel.start + 1), selection: sel };
}

export function autoPairInsert(
  content: string,
  sel: Selection,
  text: string
): { content: string; selection: Selection } {
  if (text.length === 1 && PAIR_MAP[text]) {
    const close = PAIR_MAP[text];
    if (sel.start === sel.end && content[sel.start] === close) {
      return { content, selection: { start: sel.start + 1, end: sel.start + 1 } };
    }
    const next = content.slice(0, sel.start) + text + close + content.slice(sel.end);
    const pos = sel.start + 1;
    return { content: next, selection: { start: pos, end: pos } };
  }
  return insertText(content, sel, text);
}

export function wrapSelection(
  content: string,
  sel: Selection,
  prefix: string,
  suffix: string
): { content: string; selection: Selection } {
  const before = content.slice(sel.start - prefix.length, sel.start);
  const after = content.slice(sel.end, sel.end + suffix.length);
  if (before === prefix && after === suffix) {
    const next =
      content.slice(0, sel.start - prefix.length) +
      content.slice(sel.start, sel.end) +
      content.slice(sel.end + suffix.length);
    const start = sel.start - prefix.length;
    return { content: next, selection: { start, end: start + (sel.end - sel.start) } };
  }
  let s = sel.start;
  let e = sel.end;
  if (content.slice(s - prefix.length, s) === prefix && content.slice(e, e + suffix.length) === suffix) {
    s -= prefix.length;
    e += suffix.length;
  }
  const next = content.slice(0, s) + prefix + content.slice(s, e) + suffix + content.slice(e);
  const start = s + prefix.length;
  return { content: next, selection: { start, end: start + (e - s) } };
}

export function toggleHeading(
  content: string,
  sel: Selection,
  level: number
): { content: string; selection: Selection } {
  const line = getLine(content, sel.start);
  const m = line.text.match(/^(#{1,6})\s*/);
  if (m && m[1].length === level) {
    const text = line.text.replace(/^#{1,6}\s*/, '');
    const next = content.slice(0, line.start) + text + content.slice(line.end);
    const removed = line.end - (line.start + text.length);
    const pos = Math.min(Math.max(line.start, sel.start - removed), line.start + text.length);
    return { content: next, selection: { start: pos, end: pos } };
  }
  const text = line.text.replace(/^#{1,6}\s*/, '');
  const next = content.slice(0, line.start) + '#'.repeat(level) + ' ' + text + content.slice(line.end);
  const pos = sel.start + level + 1;
  return { content: next, selection: { start: pos, end: pos } };
}

export function toggleList(
  content: string,
  sel: Selection,
  ordered: boolean
): { content: string; selection: Selection } {
  const line = getLine(content, sel.start);
  const m = line.text.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
  if (m && /^\d/.test(m[2]) === ordered) {
    const removed = line.text.length - m[3].length;
    const next = content.slice(0, line.start) + m[3] + content.slice(line.end);
    const pos = Math.min(Math.max(line.start, sel.start - removed), line.start + m[3].length);
    return { content: next, selection: { start: pos, end: pos } };
  }
  const marker = ordered ? '1. ' : '- ';
  const next = content.slice(0, line.start) + marker + line.text + content.slice(line.end);
  const pos = sel.start + marker.length;
  return { content: next, selection: { start: pos, end: pos } };
}

export function toggleBlockquote(content: string, sel: Selection): { content: string; selection: Selection } {
  const line = getLine(content, sel.start);
  if (line.text.startsWith('> ')) {
    const next = content.slice(0, line.start) + line.text.slice(2) + content.slice(line.end);
    const pos = Math.min(Math.max(line.start, sel.start - 2), line.start + line.text.length - 2);
    return { content: next, selection: { start: pos, end: pos } };
  }
  const next = content.slice(0, line.start) + '> ' + line.text + content.slice(line.end);
  const pos = sel.start + 2;
  return { content: next, selection: { start: pos, end: pos } };
}

export function indent(
  content: string,
  sel: Selection,
  outdent: boolean
): { content: string; selection: Selection } {
  const line = getLine(content, sel.start);
  if (outdent) {
    const m = line.text.match(/^ {1,4}/);
    if (!m) return { content, selection: sel };
    const next = content.slice(0, line.start) + line.text.slice(m[0].length) + content.slice(line.end);
    const pos = Math.min(Math.max(line.start, sel.start - m[0].length), line.start + line.text.length - m[0].length);
    return { content: next, selection: { start: pos, end: pos } };
  }
  const next = content.slice(0, line.start) + '  ' + line.text + content.slice(line.end);
  const pos = sel.start + 2;
  return { content: next, selection: { start: pos, end: pos } };
}

export function handleEnter(content: string, sel: Selection): { content: string; selection: Selection } {
  const line = getLine(content, sel.start);
  const text = line.text;
  const listM = text.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
  if (listM) {
    const [, ind, marker, rest] = listM;
    if (rest.trim() === '') {
      const next = content.slice(0, line.start) + content.slice(line.end);
      const pos = line.start;
      return { content: next, selection: { start: pos, end: pos } };
    }
    const newMarker = /^\d/.test(marker) ? '1. ' : marker + ' ';
    const next = content.slice(0, sel.start) + '\n' + ind + newMarker + content.slice(sel.end);
    const pos = sel.start + 1 + ind.length + newMarker.length;
    return { content: next, selection: { start: pos, end: pos } };
  }
  const quoteM = text.match(/^>\s?(.*)$/);
  if (quoteM) {
    if (quoteM[1].trim() === '') {
      const next = content.slice(0, line.start) + content.slice(line.end);
      const pos = line.start;
      return { content: next, selection: { start: pos, end: pos } };
    }
    const next = content.slice(0, sel.start) + '\n> ' + content.slice(sel.end);
    const pos = sel.start + 3;
    return { content: next, selection: { start: pos, end: pos } };
  }
  const next = content.slice(0, sel.start) + '\n' + content.slice(sel.end);
  const pos = sel.start + 1;
  return { content: next, selection: { start: pos, end: pos } };
}

export function applyAction(
  content: string,
  sel: Selection,
  action: EditorAction
): { content: string; selection: Selection } {
  switch (action) {
    case 'bold':
      return wrapSelection(content, sel, '**', '**');
    case 'italic':
      return wrapSelection(content, sel, '*', '*');
    case 'code':
      return wrapSelection(content, sel, '`', '`');
    case 'link':
      return wrapSelection(content, sel, '[', '](url)');
    case 'h1':
      return toggleHeading(content, sel, 1);
    case 'h2':
      return toggleHeading(content, sel, 2);
    case 'h3':
      return toggleHeading(content, sel, 3);
    case 'ul':
      return toggleList(content, sel, false);
    case 'ol':
      return toggleList(content, sel, true);
    case 'quote':
      return toggleBlockquote(content, sel);
  }
}
