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
    runs.push({ node, srcStart: Number(span.dataset.s), srcEnd: Number(span.dataset.e) });
  }
  return runs;
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
    const len = node.nodeValue.length;
    if (len === 0) return run.srcStart;
    const frac = Math.max(0, Math.min(1, offset / len));
    return Math.round(run.srcStart + (run.srcEnd - run.srcStart) * frac);
  }
  let target: Text | null = null;
  if (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length > 0) {
    const child = node.childNodes[Math.min(offset, node.childNodes.length - 1)];
    target = child.nodeType === Node.TEXT_NODE ? (child as Text) : lastTextIn(child);
  }
  if (!target) target = lastTextIn(node);
  if (!target) return 0;
  const run = runs.find(r => r.node === target);
  return run ? run.srcEnd : 0;
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
    for (const r of runs) {
      if (pos <= r.srcEnd) {
        const len = r.node.nodeValue.length;
        if (len === 0) return { node: r.node, offset: 0 };
        const frac = r.srcEnd > r.srcStart ? (pos - r.srcStart) / (r.srcEnd - r.srcStart) : 0;
        return { node: r.node, offset: Math.min(len, Math.max(0, Math.round(frac * len))) };
      }
    }
    const last = runs[runs.length - 1];
    return last ? { node: last.node, offset: last.node.nodeValue.length } : null;
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
