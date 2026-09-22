import type { Selection } from './editorActions';

interface Run {
  node: Text;
  srcStart: number;
  srcEnd: number;
}

function textRuns(root: HTMLElement): Run[] {
  const runs: Run[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const span = node.parentElement?.closest('[data-s]') ?? null;
    if (!span) continue;
    runs.push({ node, srcStart: Number(span.getAttribute('data-s') ?? '0'), srcEnd: Number(span.getAttribute('data-e') ?? '0') });
  }
  return runs;
}

// Prefers the first text run that is not a zero-width coverage gap. When a
// click lands on an element (e.g. a table cell with only gap spans before
// its content), mapping to the first gap run would jump the caret to a
// position in the previous block.
function firstTextIn(node: Node): Text | null {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let real: Text | null = null;
  let fallback: Text | null = null;
  while (walker.nextNode()) {
    const t = walker.currentNode as Text;
    if (fallback === null) fallback = t;
    if (t.parentElement?.getAttribute('data-gap') != null) continue;
    real = t;
    break;
  }
  return real ?? fallback;
}

function lastTextIn(node: Node): Text | null {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  while (walker.nextNode()) last = walker.currentNode as Text;
  return last;
}

function mapPos(runs: Run[], node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const run = runs.find(r => r.node === node);
    if (!run) return 0;
    const len = (node.nodeValue ?? '').length;
    if (len === 0) return run.srcStart;
    // A caret must never be typed inside a zero-width coverage gap (stripped
    // markdown such as markers and checkboxes). Line-prefix gaps ("data-gap
    // =prefix": list markers, "## ", checkboxes, fence open) always snap past
    // the markup. Other gaps (softbreaks, emphasis/code markup) map
    // monotonically by DOM offset: the front of a gap is the end of the line
    // above (clicks there land at offset 0 -> type appends to that line),
    // while the back of the gap maps to its source end so full-document
    // selections (Ctrl+A) round-trip without losing trailing characters.
    const gapKind = node.parentElement?.getAttribute('data-gap');
    if (gapKind !== null) {
      if (gapKind === 'prefix') return run.srcEnd;
      if (offset <= 0) return run.srcStart;
      if (offset >= len) return run.srcEnd;
      const frac = offset / len;
      return Math.round(run.srcStart + (run.srcEnd - run.srcStart) * frac);
    }
    const frac = Math.max(0, Math.min(1, offset / len));
    return Math.round(run.srcStart + (run.srcEnd - run.srcStart) * frac);
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const n = node.childNodes.length;
    if (offset <= 0) {
      const target = firstTextIn(node);
      const run = target && runs.find(r => r.node === target);
      return run ? run.srcStart : 0;
    }
    if (offset >= n) {
      const target = lastTextIn(node);
      const run = target && runs.find(r => r.node === target);
      return run ? run.srcEnd : 0;
    }
    const prev = lastTextIn(node.childNodes[offset - 1]);
    if (prev) {
      const run = runs.find(r => r.node === prev);
      return run ? run.srcEnd : 0;
    }
    const next = firstTextIn(node.childNodes[offset]);
    const run = next && runs.find(r => r.node === next);
    return run ? run.srcStart : 0;
  }
  return 0;
}

export interface DomSelectionLike {
  anchorNode: Node;
  anchorOffset: number;
  focusNode: Node;
  focusOffset: number;
}

export function domSelectionToSource(root: HTMLElement, sel: DomSelectionLike): Selection {
  const runs = textRuns(root);
  const a = mapPos(runs, sel.anchorNode, sel.anchorOffset);
  const f = mapPos(runs, sel.focusNode, sel.focusOffset);
  return { start: Math.min(a, f), end: Math.max(a, f) };
}

export function sourceToDomSelection(root: HTMLElement, sel: Selection): boolean {
  const runs = textRuns(root);
  const place = (pos: number): { node: Text; offset: number } | null => {
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (pos < r.srcStart || pos > r.srcEnd) continue;
      const len = (r.node.nodeValue ?? "").length;
      if (pos === r.srcStart) {
        // caret exactly at the start of this run (e.g. on a fresh empty line)
        return { node: r.node, offset: 0 };
      }
      if (pos === r.srcEnd) {
        // Prefer a following run that starts at pos (e.g. the paragraph
        // after a list item), skipping zero-width anchor runs; otherwise
        // use the end of this run.
        for (let j = i + 1; j < runs.length; j++) {
          if (runs[j].srcStart === pos) return { node: runs[j].node, offset: 0 };
          if (runs[j].srcStart > pos) break;
        }
        return { node: r.node, offset: len };
      }
      const frac = (pos - r.srcStart) / (r.srcEnd - r.srcStart);
      return { node: r.node, offset: Math.min(len, Math.max(0, Math.round(frac * len))) };
    }
    const last = runs[runs.length - 1];
    return last ? { node: last.node, offset: (last.node.nodeValue ?? "").length } : null;
  };
  const selection = window.getSelection();
  if (!selection) return false;
  const a = place(sel.start);
  const f = place(sel.end);
  if (!a || !f) return false;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(f.node, f.offset);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
