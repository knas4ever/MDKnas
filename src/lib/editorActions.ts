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
  | 'quote'
  | 'codeblock'
  | 'table'
  | 'strikethrough'
  | 'underline'
  | 'highlight'
  | 'tasklist'
  | 'selectAll';

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

// True when `pos` is exactly the start of a fence's closing line and the
// previous line is the matching opening fence line (i.e. an empty fence).
// Typing there without a newline would absorb the closing fence into the
// content line and break the block.
function atEmptyFenceContent(content: string, pos: number): boolean {
  if (pos === 0 || pos >= content.length || content[pos - 1] !== '\n') return false;
  const lineEnd = content.indexOf('\n', pos);
  const line = content.slice(pos, lineEnd === -1 ? content.length : lineEnd);
  const close = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  if (!close) return false;
  const prevEnd = pos - 1;
  const prevStart = content.lastIndexOf('\n', prevEnd - 1) + 1;
  const open = content.slice(prevStart, prevEnd).match(/^ {0,3}(`{3,}|~{3,})([ \t]*\S.*)?$/);
  return !!open && open[1][0] === close[1][0];
}

export function insertText(
  content: string,
  sel: Selection,
  text: string
): { content: string; selection: Selection } {
  let start = sel.start;
  // Typing on the blank line that ends a list item (rendered below the
  // list): the text must go AFTER that blank line as its own paragraph.
  // Inserting at the blank line's own position would make it a lazy
  // continuation of the list item, rendering inside the list.
  if (text !== '' && start === sel.end) {
    const line = getLine(content, start);
    if (line.text === '' && start > 0) {
      const prev = getLine(content, start - 1);
      const prevIsList = /^\s*([-*+]|\d+[.)])\s/.test(prev.text);
      let continuation = false;
      const nst = start + 1; // after the blank line's own newline
      if (nst < content.length) {
        const nxt = content.slice(nst);
        const nl2 = nxt.indexOf('\n');
        const nxtLine = nl2 === -1 ? nxt : nxt.slice(0, nl2);
        continuation = /^\s/.test(nxtLine) && nxtLine.trim() !== '';
      }
      if (prevIsList && !continuation) {
        start = Math.min(start + 1, content.length);
      }
    }
  }
  // Typing into an empty fence keeps the closing fence on its own line:
  // insert the text plus a newline (unless the text already ends with one).
  const ins =
    sel.start === sel.end && text !== '' && atEmptyFenceContent(content, start) && !text.endsWith('\n')
      ? text + '\n'
      : text;
  const tailStart = sel.start === sel.end ? start : sel.end;
  const next = content.slice(0, start) + ins + content.slice(tailStart);
  const pos = start + text.length;
  return { content: next, selection: { start: pos, end: pos } };
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
    const ins = atEmptyFenceContent(content, sel.start) ? text + close + '\n' : text + close;
    const next = content.slice(0, sel.start) + ins + content.slice(sel.end);
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

interface SourceLine {
  start: number;
  end: number;
  text: string;
}

function linesBetween(content: string, from: number, to: number): SourceLine[] {
  const res: SourceLine[] = [];
  let pos = from;
  while (pos < to) {
    const nl = content.indexOf('\n', pos);
    const le = nl === -1 ? content.length : nl;
    res.push({ start: pos, end: le, text: content.slice(pos, le) });
    if (nl === -1) break;
    pos = nl + 1;
  }
  return res;
}

// A selection ending exactly at a line boundary does not include that line.
function lastLineFor(content: string, sel: Selection, first: SourceLine): SourceLine {
  const rawLast = getLine(content, sel.end);
  return rawLast.start === sel.end && rawLast.start > first.start ? getLine(content, sel.end - 1) : rawLast;
}

const LIST_MARKER = /^(\s*)(?:[-*+]|\d+[.)])[ \t]+/;

// Renumber the contiguous ordered-list run that contains the line at
// `lineStart`, keeping the run's first number as the start value.
function renumberOrderedRun(content: string, lineStart: number): string {
  const lines = linesBetween(content, 0, content.length);
  const idx = lines.findIndex(l => l.start === lineStart);
  if (idx === -1) return content;
  const re = /^(\s*)(\d+)([.)])[ \t]+/;
  let lo = idx;
  while (lo > 0 && re.test(lines[lo - 1].text)) lo--;
  let hi = idx;
  while (hi < lines.length - 1 && re.test(lines[hi + 1].text)) hi++;
  const m0 = re.exec(lines[lo].text);
  if (!m0) return content;
  const first = parseInt(m0[2], 10);
  let out = content.slice(0, lines[lo].start);
  for (let i = lo; i <= hi; i++) {
    const m = re.exec(lines[i].text)!;
    out += m[1] + String(first + i - lo) + m[3] + ' ' + lines[i].text.slice(m[0].length);
    if (i < hi) out += '\n';
  }
  out += content.slice(lines[hi].end);
  return out;
}

export function toggleList(
  content: string,
  sel: Selection,
  ordered: boolean
): { content: string; selection: Selection } {
  const first = getLine(content, sel.start);
  const last = lastLineFor(content, sel, first);
  const lines = linesBetween(content, first.start, last.end + 1);
  const sameRe = ordered ? /^(\s*)\d+[.)][ \t]+/ : /^(\s*)([-*+])[ \t]+/;
  const allMatched = lines.every(l => sameRe.test(l.text));

  const parts: string[] = [];
  let n = 0;
  for (const l of lines) {
    const m = LIST_MARKER.exec(l.text);
    if (allMatched) {
      parts.push(l.text.slice(m ? m[0].length : 0));
    } else {
      n += 1;
      const ind = m ? m[1] : '';
      parts.push(ind + (ordered ? `${n}. ` : '- ') + (m ? l.text.slice(m[0].length) : l.text));
    }
  }
  let next = content.slice(0, first.start) + parts.join('\n') + content.slice(last.end);
  if (ordered && !allMatched) {
    next = renumberOrderedRun(next, first.start);
  }
  if (lines.length === 1) {
    const l = lines[0];
    const m = LIST_MARKER.exec(l.text);
    if (allMatched && m) {
      const removed = m[0].length;
      const pos = Math.min(Math.max(l.start, sel.start - removed), l.start + l.text.length - removed);
      return { content: next, selection: { start: pos, end: pos } };
    }
    const pos = Math.min(sel.start + (ordered ? 3 : 2), next.length);
    return { content: next, selection: { start: pos, end: pos } };
  }
  return { content: next, selection: { start: first.start, end: last.end } };
}

// GFM task lists: give every selected line a "[ ] " checkbox after its
// list marker (adding a "- " marker when the line has none), or toggle an
// existing checkbox's x<->space character.
export function toggleTaskList(
  content: string,
  sel: Selection
): { content: string; selection: Selection } {
  const first = getLine(content, sel.start);
  const last = lastLineFor(content, sel, first);
  const lines = linesBetween(content, first.start, last.end + 1);
  const parts = lines.map(l => {
    const t = l.text;
    if (t.trim() === '' || /^\u00a0+$/.test(t)) return t;
    const m = LIST_MARKER.exec(t);
    if (m) {
      const after = m[0].length;
      const task = t.slice(after).match(/^\[([ xX])\] /);
      if (task) {
        const ch = task[1] === ' ' ? 'x' : ' ';
        return t.slice(0, after + 1) + ch + t.slice(after + 2);
      }
      return t.slice(0, after) + '[ ] ' + t.slice(after);
    }
    return '- [ ] ' + t;
  });
  const next = content.slice(0, first.start) + parts.join('\n') + content.slice(last.end);
  const added =
    parts.join('\n').length - (last.end - first.start + 1);
  if (lines.length === 1) {
    const pos = Math.min(sel.start + added, next.length);
    return { content: next, selection: { start: pos, end: pos } };
  }
  return { content: next, selection: { start: first.start, end: last.end + added } };
}

export function toggleBlockquote(content: string, sel: Selection): { content: string; selection: Selection } {
  const first = getLine(content, sel.start);
  const last = lastLineFor(content, sel, first);
  const lines = linesBetween(content, first.start, last.end + 1);
  const allMatched = lines.every(l => l.text.startsWith('> '));
  const parts = lines.map(l => (allMatched ? l.text.slice(2) : '> ' + l.text));
  const next = content.slice(0, first.start) + parts.join('\n') + content.slice(last.end);
  if (lines.length === 1) {
    const l = lines[0];
    if (allMatched) {
      const pos = Math.min(Math.max(l.start, sel.start - 2), l.start + l.text.length - 2);
      return { content: next, selection: { start: pos, end: pos } };
    }
    const pos = Math.min(sel.start + 2, next.length);
    return { content: next, selection: { start: pos, end: pos } };
  }
  return { content: next, selection: { start: first.start, end: last.end } };
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
  // An empty line directly below an EMPTY list item visually belongs to that
  // item (its trailing newline renders inside the item), so Enter ends the
  // list by removing the item line.
  if (text === '' && line.start > 0) {
    const prev = getLine(content, line.start - 1);
    const prevM = prev.text.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (prevM) {
      const itemText = prevM[3].replace(/^\[[ xX]\] /, '');
      if (itemText.trim() === '') {
        // Remove the item line INCLUDING its terminating newline, so no
        // stray blank line is left (a blank line after the last item renders
        // inside the list and misplaces the caret).
        const cut = Math.min(prev.end + 1, content.length);
        const next = content.slice(0, prev.start) + content.slice(cut);
        const pos = prev.start;
        return { content: next, selection: { start: pos, end: pos } };
      }
    }
  }
  const listM = text.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
  if (listM) {
    const [, ind, marker, rest] = listM;
    // An empty item (no text after the marker/checkbox) ends the list:
    // the item line is removed. For a task item the checkbox ("[ ] ")
    // must not count as text.
    const itemText = rest.replace(/^\[[ xX]\] /, '');
    if (itemText.trim() === '') {
      // Remove the item line INCLUDING its terminating newline, so no
      // stray blank line is left (a blank line after the last item renders
      // inside the list and misplaces the caret).
      const cut = Math.min(line.end + 1, content.length);
      const next = content.slice(0, line.start) + content.slice(cut);
      const pos = line.start;
      return { content: next, selection: { start: pos, end: pos } };
    }
    let newMarker: string;
    // GFM task list: a new line continues the task list with a fresh
    // unchecked checkbox instead of a plain bullet (numbers increment).
    if (/^\[[ xX]\] /.test(rest)) {
      if (/^\d/.test(marker)) {
        const num = Number(marker.slice(0, -1)) + 1;
        const sep = marker[marker.length - 1];
        newMarker = `${num}${sep} [ ] `;
      } else {
        newMarker = marker + ' [ ] ';
      }
    } else if (/^\d/.test(marker)) {
      const num = Number(marker.slice(0, -1)) + 1;
      const sep = marker[marker.length - 1];
      newMarker = `${num}${sep} `;
    } else {
      newMarker = marker + ' ';
    }
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

const FENCE_LINE = /^\s*(`{3,}|~{3,})/;

// Wrap the selected lines in a fenced code block, or remove the fence when
// the caret is already inside one.
export function toggleCodeBlock(
  content: string,
  sel: Selection
): { content: string; selection: Selection } {
  const lines = linesBetween(content, 0, content.length);
  const fenceIdx: number[] = [];
  lines.forEach((l, i) => {
    if (FENCE_LINE.test(l.text)) fenceIdx.push(i);
  });
  const posLine = lines.findIndex(l => sel.start >= l.start && sel.start <= l.end);

  // Find the open/close pair that contains posLine.
  let open = -1;
  let close = -1;
  for (let i = 0; i + 1 < fenceIdx.length; i += 2) {
    if (fenceIdx[i] <= posLine && posLine <= fenceIdx[i + 1]) {
      open = fenceIdx[i];
      close = fenceIdx[i + 1];
      break;
    }
  }

  if (open !== -1 && close !== -1) {
    // Unwrap: keep the lines between the fences, drop the fence lines.
    const inner = lines.slice(open + 1, close).map(l => l.text).join('\n');
    const next =
      content.slice(0, lines[open].start) + inner + content.slice(lines[close].end);
    const pos = Math.min(Math.max(lines[open].start, sel.start), next.length);
    return { content: next, selection: { start: pos, end: pos } };
  }

  // Wrap: expand to whole lines (a collapsed caret on an empty line makes
  // an empty block).
  const first = getLine(content, sel.start);
  const last = lastLineFor(content, sel, first);
  const blockLines = linesBetween(content, first.start, last.end + 1).map(l => l.text);
  const block = '```\n' + blockLines.join('\n') + '\n```';
  const next = content.slice(0, first.start) + block + content.slice(last.end);
  const pos = first.start + 4;
  return { content: next, selection: { start: pos, end: pos } };
}

// Insert a markdown table with `rows` total rows (first row is the header)
// and `cols` columns at the selection position.
export function insertTable(
  content: string,
  sel: Selection,
  rows: number,
  cols: number
): { content: string; selection: Selection } {
  const r = Math.max(1, Math.min(20, rows));
  const c = Math.max(1, Math.min(20, cols));
  const empty = Array.from({ length: c }, () => '  ').join(' | ');
  const sep = Array.from({ length: c }, () => '---').join(' | ');
  const header = Array.from({ length: c }, (_, i) => `Column ${i + 1}`).join(' | ');
  const table = [
    `| ${header} |`,
    `| ${sep} |`,
    ...Array.from({ length: r - 1 }, () => `| ${empty} |`)
  ].join('\n');

  const line = getLine(content, sel.start);
  const before = sel.start > line.start ? '\n' : '';
  const after = sel.end < line.end ? '\n' : '';
  const next = content.slice(0, sel.start) + before + table + after + content.slice(sel.end);
  const start = sel.start + before.length;
  return { content: next, selection: { start, end: start + table.length } };
}

export function applyLink(
  content: string,
  sel: Selection,
  url?: string
): { content: string; selection: Selection } {
  const text = sel.end > sel.start ? content.slice(sel.start, sel.end) : 'text';
  const link = `[${text}](${url ?? 'url'})`;
  const next = content.slice(0, sel.start) + link + content.slice(sel.end);
  const textStart = sel.start + 1;
  return { content: next, selection: { start: textStart, end: textStart + text.length } };
}

export function applyAction(
  content: string,
  sel: Selection,
  action: EditorAction,
  arg?: string
): { content: string; selection: Selection } {
  switch (action) {
    case 'selectAll':
      return { content, selection: { start: 0, end: content.length } };
    case 'bold':
      return wrapSelection(content, sel, '**', '**');
    case 'italic':
      return wrapSelection(content, sel, '*', '*');
    case 'code':
      return wrapSelection(content, sel, '`', '`');
    case 'link':
      return applyLink(content, sel, arg);
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
    case 'codeblock':
      return toggleCodeBlock(content, sel);
    case 'tasklist':
      return toggleTaskList(content, sel);
    case 'strikethrough':
      return wrapSelection(content, sel, '~~', '~~');
    case 'underline':
      return wrapSelection(content, sel, '<u>', '</u>');
    case 'highlight':
      return wrapSelection(content, sel, '<mark>', '</mark>');
    case 'table': {
      const [rows, cols] = (arg ?? '3,3').split(',').map(n => parseInt(n, 10) || 1);
      return insertTable(content, sel, rows, cols);
    }
  }
}
