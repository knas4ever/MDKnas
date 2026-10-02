import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { renderMarkdown } from '../lib/markdown';
import { htmlFragmentToMarkdown } from '../lib/clipboardMd';
import { domSelectionToSource, sourceToDomSelection } from '../lib/cursor';
import {
  applyAction,
  autoPairInsert,
  backspace,
  deleteForward,
  handleEnter,
  indent,
  insertText,
  tableOperation,
  type EditorAction,
  type Selection,
  type TableOp
} from '../lib/editorActions';

export interface WysiwygEditorHandle {
  execute(action: EditorAction, arg?: string): void;
  focus(): void;
  jumpTo(pos: number): void;
}

interface Props {
  content: string;
  selection: Selection;
  onChange(content: string, selection: Selection): void;
  fontSize?: number;
  typewriter?: boolean;
  // Absolute path of the open document (used to resolve image srcs and to
  // choose the assets folder for dropped images: <name>_assets/).
  file?: string | null;
}

// 'k' (link) is handled by the app-level key listener because it needs
// the URL prompt dialog; the toolbar link button goes through the same
// app-level dialog as well.
const SHORTCUTS_PLAIN: Record<string, EditorAction> = {
  a: 'selectAll',
  b: 'bold',
  i: 'italic',
  u: 'underline',
  '`': 'code'
};

const SHORTCUTS_SHIFT: Record<string, EditorAction> = {
  '1': 'h1',
  '2': 'h2',
  '3': 'h3',
  l: 'ul',
  '7': 'ol',
  q: 'quote',
  x: 'strikethrough',
  h: 'highlight',
  t: 'tasklist'
};

function selectionForAction(content: string, sel: Selection): Selection {
  if (sel.start !== sel.end) return sel;
  const p = sel.start;
  const isWord = (c: string | undefined): boolean =>
    c !== undefined && (/\w/.test(c) || c === '-');
  let s = p;
  while (s > 0 && isWord(content[s - 1])) s -= 1;
  let e = p;
  while (e < content.length && isWord(content[e])) e += 1;
  return e === s ? sel : { start: s, end: e };
}

// Returns the source range of the image whose rendered span the caret is
// inside (or directly adjacent to), so Backspace/Delete remove the whole
// image instead of a single markup character.
function imageRangeAt(
  root: HTMLElement | null,
  content: string,
  pos: number,
  dir: 'back' | 'fwd'
): { s: number; e: number } | null {
  if (!root) return null;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('.img-wrap'))) {
    const s = Number(el.dataset.s ?? '-1');
    const e = Number(el.dataset.e ?? '-1');
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > content.length || e <= s) continue;
    if (dir === 'back' && pos > s && pos <= e) return { s, e };
    if (dir === 'fwd' && pos >= s && pos < e) return { s, e };
  }
  return null;
}

// Inline markup the caret steps over in a single arrow-key press: a whole
// run of emphasis characters, or an HTML inline tag. Leaving styled text
// must never cost one press per marker character.
const MARKUP_RUN_CHARS = '*_~`';
const MARKUP_TAGS = ['<u>', '</u>', '<mark>', '</mark>'];

// The source position reached by stepping one arrow key right/left from pos
// over the markup sitting at the caret (returns pos when there is none).
function markupStep(content: string, pos: number, dir: 'left' | 'right'): number {
  if (dir === 'right') {
    const ch = content[pos];
    if (ch && MARKUP_RUN_CHARS.includes(ch)) {
      let e = pos;
      while (e < content.length && content[e] === ch) e += 1;
      return e;
    }
    for (const tag of MARKUP_TAGS) {
      if (content.startsWith(tag, pos)) return pos + tag.length;
    }
    return pos;
  }
  const ch = content[pos - 1];
  if (ch && MARKUP_RUN_CHARS.includes(ch)) {
    let s = pos - 1;
    while (s >= 0 && content[s] === ch) s -= 1;
    return s + 1;
  }
  for (const tag of MARKUP_TAGS) {
    if (content.endsWith(tag, pos)) return pos - tag.length;
  }
  return pos;
}

// The element that renders the caret's line (paragraph, list item,
// heading, table cell, ...). The browser cannot move the caret out of
// these blocks, so ArrowDown/ArrowUp on their last/first line cross to the
// neighbouring block manually.
// The element that renders the caret's visual line: a text block
// (paragraph, list item, heading, pre, table cell) or a blank-line div.
// The browser cannot reliably move the caret out of these, so
// ArrowDown/ArrowUp on their last/first line cross manually.
function lineUnitOf(node: Node, root: HTMLElement): HTMLElement | null {
  let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el && el !== root) {
    if (el.hasAttribute('data-blank-line')) return el as HTMLElement;
    const tag = el.tagName;
    if (tag === 'P' || tag === 'LI' || tag === 'PRE' || tag === 'BLOCKQUOTE' || tag === 'TD' || /^H[1-6]$/.test(tag)) {
      return el as HTMLElement;
    }
    el = el.parentElement;
  }
  return null;
}

// Leaf line units render real text lines; the others group them.
function isLeafUnit(el: Element): boolean {
  const tag = el.tagName;
  return tag === 'P' || tag === 'LI' || tag === 'PRE' || tag === 'TD' || /^H[1-6]$/.test(tag);
}
function isUnit(el: Element): boolean {
  return el.hasAttribute('data-blank-line') || isLeafUnit(el) ||
    el.tagName === 'BLOCKQUOTE' || el.tagName === 'UL' || el.tagName === 'OL' || el.tagName === 'TABLE';
}

// The leaf unit holding the first (or last) visual line of a unit.
function leafOf(unit: HTMLElement, first: boolean): HTMLElement | null {
  if (unit.hasAttribute('data-blank-line')) return unit;
  if (isLeafUnit(unit)) return unit;
  if (unit.tagName === 'TABLE') {
    const tds = unit.querySelectorAll('td');
    return tds.length ? (tds[first ? 0 : tds.length - 1] as HTMLElement) : null;
  }
  const kids = Array.from(unit.children).filter(c => isUnit(c));
  if (!kids.length) return null;
  return leafOf(kids[first ? 0 : kids.length - 1] as HTMLElement, first);
}

// The neighbouring line unit in the requested direction, skipping
// non-unit elements; walks up through containers as needed.
function adjacentUnit(unit: HTMLElement, root: HTMLElement, down: boolean): HTMLElement | null {
  let el: Element | null = unit;
  while (el && el !== root) {
    let sib: Element | null = down ? el.nextElementSibling : el.previousElementSibling;
    while (sib) {
      if (isUnit(sib)) return sib as HTMLElement;
      sib = down ? sib.nextElementSibling : sib.previousElementSibling;
    }
    el = el.parentElement;
  }
  return null;
}

// All editable text nodes of a block, in DOM order: real text, skipping
// zero-width coverage gaps and blank-line divs.
function realTextNodes(block: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode()) !== null) {
    const t = n as Text;
    if ((t.nodeValue ?? '').length === 0) continue;
    if (t.parentElement?.closest('[data-blank-line]')) continue;
    if (t.parentElement?.getAttribute('data-gap') != null) continue;
    nodes.push(t);
  }
  return nodes;
}

// The rect of a collapsed caret at an offset inside a text node. A range
// rect unions every line a wrapped node spans, while a collapsed caret stays
// on the single visual line the offset belongs to.
function caretRect(node: Text, offset: number): DOMRect {
  const len = (node.nodeValue ?? '').length;
  const at = Math.max(0, Math.min(offset, len));
  const r = document.createRange();
  r.setStart(node, at);
  r.setEnd(node, at);
  return r.getBoundingClientRect();
}

// The first and last offset of a node whose caret sits on the visual line at
// `top`, or null when the node has no fragment there. Caret tops are
// non-decreasing with the offset, so both edges binary-search.
function offsetsOnLine(node: Text, top: number): { from: number; to: number } | null {
  const len = (node.nodeValue ?? '').length;
  const topAt = (i: number) => caretRect(node, i).top;
  let lo = 0;
  let hi = len;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (topAt(mid) >= top - 1) hi = mid;
    else lo = mid + 1;
  }
  const from = lo;
  lo = 0;
  hi = len;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (topAt(mid) <= top + 1) lo = mid + 1;
    else hi = mid;
  }
  const to = lo - 1;
  return from <= to ? { from, to } : null;
}

// The real text nodes of a block that have a fragment on the visual line at
// `top`, with the offsets each one covers there.
function lineFragments(block: HTMLElement, top: number): Array<{ node: Text; from: number; to: number }> {
  const out: Array<{ node: Text; from: number; to: number }> = [];
  for (const n of realTextNodes(block)) {
    const f = offsetsOnLine(n, top);
    if (f) out.push({ node: n, from: f.from, to: f.to });
  }
  return out;
}

// The offset in [from, to] whose caret x is closest to x.
function offsetAtX(node: Text, from: number, to: number, x: number): number {
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (caretRect(node, mid).left >= x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// The first (or last) real text node of a block: editable text, skipping
// zero-width coverage gaps and blank-line divs (rendered inside the
// preceding block). Its span's data-s/data-e attributes give the source
// range of that line's text, which is used to place the caret when
// crossing between blocks.
function realTextNodeOf(block: HTMLElement, first: boolean): Text | null {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const isReal = (n: Node): boolean =>
    (n.nodeValue ?? '').length > 0 &&
    !n.parentElement?.closest('[data-blank-line]') &&
    n.parentElement?.getAttribute('data-gap') == null;
  let node: Node | null = null;
  if (first) {
    let n: Node | null;
    while ((n = walker.nextNode()) !== null) if (isReal(n)) { node = n; break; }
  } else {
    let n: Node | null;
    while ((n = walker.nextNode()) !== null) if (isReal(n)) node = n;
  }
  return (node as Text | null) ?? null;
}

function precedingEditableSourceEnd(root: HTMLElement, block: HTMLElement): number | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let end: number | null = null;
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    const text = node as Text;
    if (block.contains(text)) break;
    if (!(text.nodeValue ?? '').length) continue;
    const parent = text.parentElement;
    if (parent?.closest('.src-only') || parent?.getAttribute('data-gap') != null) continue;
    const span = parent?.closest<HTMLElement>('[data-s]');
    const value = Number(span?.dataset.e ?? '-1');
    if (Number.isInteger(value) && value >= 0) end = value;
  }
  return end;
}

function followingCodeBlock(unit: HTMLElement, root: HTMLElement): HTMLElement | null {
  let el: Element | null = unit;
  while (el && el !== root) {
    let sibling: Element | null = el.nextElementSibling;
    while (sibling) {
      if (sibling.classList.contains('codeblock')) return sibling as HTMLElement;
      if (!sibling.hasAttribute('data-blank-line') && !sibling.classList.contains('src-only')) return null;
      sibling = sibling.nextElementSibling;
    }
    el = el.parentElement;
  }
  return null;
}

function rectOfText(node: Text): DOMRect {
  const r = document.createRange();
  r.setStart(node, 0);
  r.setEnd(node, (node.nodeValue ?? '').length);
  return r.getBoundingClientRect();
}

// Rect of the unit's first or last VISUAL line, counting real text lines
// and blank-line divs rendered inside the unit (e.g. inside a list item).
function boundaryRectOf(unit: HTMLElement, first: boolean): DOMRect | null {
  const rects: Array<() => DOMRect> = [];
  const walk = (el: Element): void => {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const tn = child as Text;
        const p = child.parentElement;
        if (
          (tn.nodeValue ?? '').length > 0 &&
          !p?.closest('[data-blank-line]') &&
          p?.getAttribute('data-gap') == null
        ) {
          rects.push(() => rectOfText(tn));
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const ce = child as Element;
        if (ce.hasAttribute('data-blank-line')) rects.push(() => ce.getBoundingClientRect());
        else walk(ce);
      }
    }
  };
  walk(unit);
  if (!rects.length) return null;
  return rects[first ? 0 : rects.length - 1]();
}

export default forwardRef<WysiwygEditorHandle, Props>(function WysiwygEditor(
  { content, selection, onChange, fontSize = 16, typewriter = false, file = null },
  ref
) {
  const docDir = file ? file.slice(0, file.lastIndexOf('/')) : null;
  const assetsName = file
    ? `${file.slice(file.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '')}_assets`
    : null;
  const rootRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  // True between a state update and the passive effect that re-renders the
  // DOM and re-places the caret. selectionchange events arriving in this
  // window observe transient DOM selection states and must not be trusted.
  const pendingRender = useRef(false);
  // True while the mouse button is held down. During a drag the browser owns
  // the selection: re-placing it via addRange resets the selection anchor to
  // the minimum side, which fights the browser's drag tracking and breaks
  // right-to-left / bottom-to-top drags. The final drag selection is synced
  // into state exactly once, on mouseup.
  const draggingRef = useRef(false);
  // Cache of absolute image path -> data URL, filled via IPC. Bumping
  // imgVersion re-renders once new entries arrive.
  const imgCache = useRef(new Map<string, string>());
  const [imgVersion, setImgVersion] = useState(0);
  const retryTick = useRef<(() => void) | null>(null);
  const processSelectionRef = useRef<() => void>(() => {});
  const verticalColumnRef = useRef<number | null>(null);
  // Right-click context menu on a table: add/remove rows and columns.
  const [tableMenu, setTableMenu] = useState<{
    x: number;
    y: number;
    s: number;
    e: number;
    row: number;
    col: number;
    rows: number;
    cols: number;
  } | null>(null);

  // Block file drops anywhere outside the editor so the window doesn't
  // navigate to the dropped file.
  useEffect(() => {
    const prevent = (e: DragEvent): void => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
      }
    };
    document.addEventListener('dragover', prevent);
    document.addEventListener('drop', prevent);
    return () => {
      document.removeEventListener('dragover', prevent);
      document.removeEventListener('drop', prevent);
    };
  }, []);

  const apply = useCallback(
    (next: { content: string; selection: Selection }) => {
      pendingRender.current = true;
      onChange(next.content, next.selection);
    },
    [onChange]
  );

  const effectiveSelection = useCallback((): Selection => {
    const root = rootRef.current;
    const sel = window.getSelection();
    if (root && sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (root.contains(r.startContainer) && root.contains(r.endContainer)) {
        return domSelectionToSource(root, {
          anchorNode: r.startContainer,
          anchorOffset: r.startOffset,
          focusNode: r.endContainer,
          focusOffset: r.endOffset
        });
      }
    }
    return selection;
  }, [selection]);

  useImperativeHandle(
    ref,
    () => ({
      execute: (action: EditorAction, arg?: string) => {
        const sel = selectionForAction(content, effectiveSelection());
        apply(applyAction(content, sel, action, arg));
      },
      focus: () => {
        rootRef.current?.focus();
      },
      // Move the caret to a source position (outline jump) and scroll the
      // block into view: the programmatic range placement does not scroll
      // the editor container on its own.
      jumpTo: (pos: number) => {
        const root = rootRef.current;
        if (!root) return;
        if (!sourceToDomSelection(root, { start: pos, end: pos })) return;
        root.focus();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const node = sel.getRangeAt(0).startContainer;
        const el =
          node.nodeType === Node.ELEMENT_NODE
            ? (node as HTMLElement)
            : (node.parentElement ?? root);
        el.scrollIntoView({ block: 'start' });
      }
    }),
    [content, selection, apply, effectiveSelection]
  );

  // Re-render the DOM only when the content (or the image cache) changes.
  // Replacing innerHTML on a pure caret move / selection extend would
  // destroy the browser's in-flight selection, so drag/extend gestures
  // only work in one direction otherwise.
  const renderedRef = useRef<{ content: string; imgVersion: number } | null>(null);

  // The DOM range we last placed from source state. The browser fires
  // selectionchange after our programmatic placement; re-mapping that range
  // to source is lossy (zero-width coverage gaps snap), so when the DOM range
  // is exactly what we placed, the source state is already authoritative and
  // the feedback is skipped.
  const placedRangeRef = useRef<{
    startNode: Node;
    startOffset: number;
    endNode: Node;
    endOffset: number;
  } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const last = renderedRef.current;
    if (last === null || last.content !== content || last.imgVersion !== imgVersion) {
      renderedRef.current = { content, imgVersion };
      root.innerHTML = renderMarkdown(content, docDir ?? undefined, (abs) => imgCache.current.get(abs) ?? null);
      // Local images are read by the main process (the renderer cannot load
      // file:// sub-resources); fetch uncached ones and re-render.
      if (docDir) {
        root.querySelectorAll<HTMLImageElement>('img.md-img[data-abs]').forEach((el) => {
          const abs = el.dataset.abs ?? '';
          if (!abs || imgCache.current.has(abs)) return;
          imgCache.current.set(abs, '');
          const rel = abs.startsWith(`${docDir}/`) ? abs.slice(docDir.length + 1) : abs;
          void window.api.readImageAsDataUrl(docDir, rel).then((url) => {
            if (url) {
              imgCache.current.set(abs, url);
              setImgVersion((v) => v + 1);
            } else {
              imgCache.current.delete(abs);
            }
          });
        });
      }
      try {
        void mermaid.run({ querySelector: '.mermaid' });
      } catch {
        // mermaid render failure: raw text stays visible in the block
      }
    }
    if (!draggingRef.current) {
      sourceToDomSelection(root, selection);
      const s = window.getSelection();
      if (s && s.rangeCount > 0) {
        const r = s.getRangeAt(0);
        placedRangeRef.current = {
          startNode: r.startContainer,
          startOffset: r.startOffset,
          endNode: r.endContainer,
          endOffset: r.endOffset
        };
      }
    }
    if (typewriter) {
      const sel = window.getSelection();
      if (sel && sel.anchorNode && root.contains(sel.anchorNode)) {
        const block = (sel.anchorNode.parentElement ?? root).closest('[data-bi]');
        if (block) block.setAttribute('data-active-line', 'true');
      }
    }
    pendingRender.current = false;
  }, [content, selection, typewriter, imgVersion, docDir]);

  // Always keep the DOM->source processing callback current.
  useEffect(() => {
    processSelectionRef.current = () => {
      if (composing.current) return;
      const root = rootRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer)) return;
      // Our own programmatic placement: the source state already matches the
      // DOM, and re-mapping the range is lossy — skip the feedback.
      const placed = placedRangeRef.current;
      if (
        placed &&
        range.startContainer === placed.startNode &&
        range.startOffset === placed.startOffset &&
        range.endContainer === placed.endNode &&
        range.endOffset === placed.endOffset
      ) {
        return;
      }
      // Clicking a form control (task-list checkbox) inside the editor must
      // not move the caret: element anchors on an <input> map to position 0.
      if (
        range.startContainer instanceof HTMLInputElement ||
        range.endContainer instanceof HTMLInputElement
      ) {
        return;
      }
      const next = domSelectionToSource(root, {
        anchorNode: range.startContainer,
        anchorOffset: range.startOffset,
        focusNode: range.endContainer,
        focusOffset: range.endOffset
      });
      if (next.start !== selection.start || next.end !== selection.end) {
        pendingRender.current = true;
        onChange(content, next);
      }
    };
  });

  // Track mouse presses so drags are left to the browser (see draggingRef).
  useEffect(() => {
    const onDown = () => {
      draggingRef.current = true;
      verticalColumnRef.current = null;
    };
    const onUp = () => {
      const wasDragging = draggingRef.current;
      draggingRef.current = false;
      // Sync the finished drag (or click) selection into state. Skipped when
      // the DOM selection is outside the editor (processSelectionRef guard).
      if (wasDragging) processSelectionRef.current();
    };
    const onBlur = () => {
      draggingRef.current = false;
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const onSelectionChange = () => {
      if (draggingRef.current) return;
      if (pendingRender.current) {
        // A re-render is in flight; the current DOM selection is transient.
        // Retry once the pending effect has finished.
        if (!retryTick.current) {
          let hops = 0;
          const tick = () => {
            retryTick.current = null;
            if (pendingRender.current && hops < 100) {
              hops += 1;
              retryTick.current = tick;
              queueMicrotask(tick);
              return;
            }
            if (!pendingRender.current) processSelectionRef.current();
          };
          retryTick.current = tick;
          queueMicrotask(tick);
        }
        return;
      }
      processSelectionRef.current();
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const el = e.target as HTMLElement;
    // Task-list checkbox: toggle the "[ ]" / "[x]" character in the source.
    const taskLabel = el.closest('.task') as HTMLElement | null;
    if (taskLabel) {
      const cb = taskLabel.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (cb) {
        e.stopPropagation();
        const pos = Number(cb.dataset.ck ?? '-1');
        if (Number.isInteger(pos) && pos >= 0 && pos < content.length) {
          const ch = content[pos];
          if (ch === 'x' || ch === 'X' || ch === ' ') {
            const nextCh = ch === 'x' || ch === 'X' ? ' ' : 'x';
            // Caret lands after the "[ ] " / "[x] " prefix so typing
            // continues the task text instead of editing the checkbox.
            apply({
              content: content.slice(0, pos) + nextCh + content.slice(pos + 1),
              selection: { start: pos + 3, end: pos + 3 }
            });
          }
        }
        return;
      }
    }
    const btn = el.closest('.code-copy') as HTMLElement | null;
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      void navigator.clipboard.writeText(btn.dataset.raw ?? '').catch(() => {
        /* clipboard unavailable */
      });
      btn.textContent = 'Copied';
      window.setTimeout(() => {
        btn.textContent = 'Copy';
      }, 1500);
      return;
    }
    // Links open in the OS browser; keep the caret where it was.
    const link = el.closest('a') as HTMLAnchorElement | null;
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      window.api.openExternal(link.href);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>): void => {
    const el = e.target as HTMLElement;
    const table = el.closest('table') as HTMLElement | null;
    if (!table) return; // elsewhere: keep the browser's default menu
    const cell = el.closest('td, th') as HTMLElement | null;
    if (!cell) return;
    const s = Number(table.dataset.s ?? '-1');
    const en = Number(table.dataset.e ?? '-1');
    if (!Number.isInteger(s) || !Number.isInteger(en) || s < 0 || en > content.length) return;
    e.preventDefault();
    const tr = cell.parentElement as HTMLTableRowElement | null;
    const tableRows = Array.from(table.querySelectorAll('tr'));
    const row = tr ? tableRows.indexOf(tr) : -1;
    const col = tr ? Array.from(tr.children).indexOf(cell) : -1;
    if (row < 0 || col < 0) return;
    // DOM rows: 0 = header, 1.. = body. The separator row is not rendered
    // as a DOM row, so source row k (k >= 1) is DOM row k - 1.
    const srcRow = row === 0 ? 0 : row + 1;
    setTableMenu({
      x: e.clientX,
      y: e.clientY,
      s,
      e: en,
      row: srcRow,
      col,
      rows: tableRows.length,
      cols: table.querySelector('tr')?.children.length ?? 0
    });
  };

  const runTableOp = (op: TableOp): void => {
    const m = tableMenu;
    if (!m) return;
    setTableMenu(null);
    const res = tableOperation(content, m.s, m.e, m.row, m.col, op);
    if (res) apply(res);
  };

  useEffect(() => {
    if (!tableMenu) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setTableMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tableMenu]);

  // Drag & drop: images are saved into the document's assets folder
  // (<name>_assets/) and inserted as markdown at the caret position.
  const hasFiles = (e: React.DragEvent<HTMLDivElement>): boolean =>
    Array.from(e.dataTransfer.types).includes('Files');

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (hasFiles(e)) e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (!docDir || !assetsName) return;
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (dropped.length === 0) return;
    void (async () => {
      let c = content;
      let sel: Selection = selection;
      for (const f of dropped) {
        const data = await f.arrayBuffer();
        const rel = await window.api.saveImage(docDir, assetsName, f.name, data);
        if (!rel) continue;
        const res = insertText(c, sel, `![${f.name}](${rel})`);
        c = res.content;
        sel = res.selection;
      }
      apply({ content: c, selection: sel });
    })();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (composing.current) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') verticalColumnRef.current = null;
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      const action = e.shiftKey ? SHORTCUTS_SHIFT[k] : SHORTCUTS_PLAIN[k];
      if (action) {
        e.preventDefault();
        const sel = selectionForAction(content, effectiveSelection());
        apply(applyAction(content, sel, action));
      }
      return;
    }
    switch (e.key) {
      case 'Backspace': {
        e.preventDefault();
        const img = imageRangeAt(rootRef.current, content, selection.start, 'back');
        if (img) {
          apply({
            content: content.slice(0, img.s) + content.slice(img.e),
            selection: { start: img.s, end: img.s }
          });
        } else {
          apply(backspace(content, selection));
        }
        return;
      }
      case 'Delete': {
        e.preventDefault();
        const img = imageRangeAt(rootRef.current, content, selection.start, 'fwd');
        if (img) {
          apply({
            content: content.slice(0, img.s) + content.slice(img.e),
            selection: { start: img.s, end: img.s }
          });
        } else {
          apply(deleteForward(content, selection));
        }
        return;
      }
      case 'Tab':
        e.preventDefault();
        apply(indent(content, selection, !e.shiftKey));
        return;
      case 'Enter':
        e.preventDefault();
        apply(handleEnter(content, selection));
        return;
      case 'ArrowLeft': {
        if (e.shiftKey || e.altKey) return;
        const root = rootRef.current;
        const sel = window.getSelection();
        if (!root || !sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!range.collapsed) return;
        // Step over a whole emphasis run in one press, so leaving styled text
        // costs a single key regardless of the marker length. Code keeps its
        // literal characters, so it is excluded.
        const inCode =
          (range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as Element)
            : range.startContainer.parentElement)?.closest('pre code') != null;
        if (!inCode) {
          const caret = effectiveSelection();
          const to =
            caret.start === caret.end ? markupStep(content, caret.start, 'left') : caret.start;
          if (to !== caret.start) {
            e.preventDefault();
            apply({ content, selection: { start: to, end: to } });
            return;
          }
        }
        const pre =
          range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as Element).closest('pre')
            : range.startContainer.parentElement?.closest('pre');
        if (!pre) return;
        const first = realTextNodeOf(pre as HTMLElement, true);
        if (range.startContainer !== first || range.startOffset !== 0) return;
        const block = (pre.closest('.codeblock') ?? pre) as HTMLElement;
        const pos = precedingEditableSourceEnd(root, block);
        if (pos === null) return;
        e.preventDefault();
        apply({ content, selection: { start: pos, end: pos } });
        return;
      }
      case 'ArrowRight': {
        if (e.shiftKey || e.altKey) return;
        const root = rootRef.current;
        const sel = window.getSelection();
        if (!root || !sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!range.collapsed) return;
        // Step over a whole emphasis run in one press (see ArrowLeft).
        const inCode =
          (range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as Element)
            : range.startContainer.parentElement)?.closest('pre code') != null;
        if (!inCode) {
          const caret = effectiveSelection();
          const to =
            caret.start === caret.end ? markupStep(content, caret.start, 'right') : caret.start;
          if (to !== caret.start) {
            e.preventDefault();
            apply({ content, selection: { start: to, end: to } });
            return;
          }
        }
        const unit = lineUnitOf(range.startContainer, root);
        if (!unit) return;
        const last = realTextNodeOf(unit, false);
        const gap = range.startContainer.parentElement?.closest('[data-gap]');
        const atTrailingGap =
          gap?.getAttribute('data-gap') !== 'prefix' &&
          gap?.closest('[data-blank-line]') == null;
        const atTextEnd =
          range.startContainer === last &&
          range.startOffset === (last.nodeValue ?? '').length;
        if (!atTextEnd && !atTrailingGap) return;
        const block = followingCodeBlock(unit, root);
        const first = block?.querySelector('pre') && realTextNodeOf(block.querySelector('pre')!, true);
        if (!first) return;
        const pos = Number(first.parentElement?.closest<HTMLElement>('[data-s]')?.dataset.s ?? '-1');
        if (!Number.isInteger(pos) || pos < 0) return;
        e.preventDefault();
        apply({ content, selection: { start: pos, end: pos } });
        return;
      }
      case 'ArrowDown':
      case 'ArrowUp': {
        if (e.shiftKey || e.altKey) return; // let the browser select
        const root = rootRef.current;
        const sel = window.getSelection();
        if (!root || !sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const use = lineUnitOf(range.startContainer, root);
        if (!use) return;
        const down = e.key === 'ArrowDown';
        const cr = range.getBoundingClientRect();
        // Zero-width coverage gaps at a block's edge create phantom line
        // boxes, so compare the caret's line with the unit's first/last
        // VISUAL line (real text or an internal blank line) instead of the
        // unit rect. A blank-line unit is a single line, so it is always on
        // its boundary. Wrapped list items keep their inner lines with the
        // native move; only the first/last line crosses to the neighbour.
        if (!use.hasAttribute('data-blank-line')) {
          const refRect = boundaryRectOf(use, !down);
          if (!refRect) return;
          const onBoundaryLine = down ? cr.bottom >= refRect.bottom - 4 : cr.top <= refRect.top + 4;
          if (!onBoundaryLine) return; // let the native move handle intra-unit
        }
        const target = adjacentUnit(use, root, down);
        if (!target) return;
        const leaf = leafOf(target, down);
        if (!leaf) return;
        const current =
          range.startContainer.nodeType === Node.TEXT_NODE &&
          range.startContainer.parentElement?.getAttribute('data-gap') == null
            ? (range.startContainer as Text)
            : realTextNodeOf(use, !down);
        // The caret's column, measured in pixels from the left edge of the
        // visual line it sits on. A line-relative column (not an absolute
        // screen x) is what survives crossing indented blocks: list markers,
        // task checkboxes and headings all shift the text column.
        const caretFrags = lineFragments(use, cr.top);
        const currentLeft = caretFrags.length
          ? Math.min(...caretFrags.map((f) => caretRect(f.node, f.from).left))
          : current
            ? caretRect(current, 0).left
            : cr.left;
        const columnPx =
          verticalColumnRef.current ?? Math.max(0, cr.left - currentLeft);
        e.preventDefault();
        if (leaf.hasAttribute('data-blank-line')) {
          // Land on the blank line itself (its nbsp span's source position).
          const span = leaf.querySelector('span');
          const src = Number(span?.getAttribute('data-s') ?? 0);
          verticalColumnRef.current = columnPx;
          apply({ content, selection: { start: src, end: src } });
          return;
        }
        // The target's first (down) or last (up) visual line: every text
        // fragment on that line is a candidate, so a caret right of inline
        // markup (bold, code, links) stays right of it instead of clipping
        // into the leading span, and a wrapped item is entered on the line
        // it actually shows instead of its first one.
        const targetNodes = realTextNodes(leaf);
        if (!targetNodes.length) return;
        const lastTarget = targetNodes[targetNodes.length - 1];
        const targetTop = down
          ? caretRect(targetNodes[0], 0).top
          : caretRect(lastTarget, (lastTarget.nodeValue ?? '').length).top;
        const targetFrags = lineFragments(leaf, targetTop);
        if (!targetFrags.length) return;
        const targetLeft = Math.min(...targetFrags.map((f) => caretRect(f.node, f.from).left));
        const targetX = targetLeft + columnPx;
        let chosen = targetFrags[targetFrags.length - 1];
        for (const f of targetFrags) {
          if (targetX <= caretRect(f.node, f.to).right) {
            chosen = f;
            break;
          }
        }
        const targetOffset = offsetAtX(chosen.node, chosen.from, chosen.to, targetX);
        const span = chosen.node.parentElement?.closest('[data-s]');
        const srcStart = Number(span?.getAttribute('data-s') ?? 0);
        const srcEnd = Number(span?.getAttribute('data-e') ?? srcStart);
        const textLen = (chosen.node.nodeValue ?? '').length;
        // Spans whose rendered text is shorter than their source range
        // (math, image alt) map proportionally, like cursor.ts.
        const pos =
          srcStart + (textLen === 0 ? 0 : Math.round(((srcEnd - srcStart) * targetOffset) / textLen));
        verticalColumnRef.current = columnPx;
        apply({ content, selection: { start: pos, end: pos } });
        return;
      }
    }
  };

  const handleBeforeInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (composing.current) return;
    const ev = e.nativeEvent as InputEvent;
    if (ev.type === 'compositionend') return;
    // React replays beforeinput from keypress/textInput; for space the replay
    // comes from keypress, whose native event has no `data` — the synthetic
    // event carries the character in `e.data`.
    const data = (e as unknown as { data?: string }).data ?? ev.data;
    if (data && ev.inputType !== 'deleteContentBackward') {
      e.preventDefault();
      apply(autoPairInsert(content, selection, data));
    }
  };

  // Copy/cut put the RAW MARKDOWN of the selection on the clipboard (not
  // the rendered HTML), so paste-back preserves all formatting exactly.
  // The source-level selection state is used (not a live DOM re-mapping):
  // the state is kept in sync by the selectionchange/mouseup handlers and
  // maps losslessly, whereas a DOM round-trip can drop leading/trailing
  // characters that live in zero-width coverage gaps.
  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>): void => {
    const sel = selectionForAction(content, selection);
    e.preventDefault();
    e.clipboardData.setData('text/plain', content.slice(sel.start, sel.end));
  };

  const handleCut = (e: React.ClipboardEvent<HTMLDivElement>): void => {
    const sel = selectionForAction(content, selection);
    e.preventDefault();
    e.clipboardData.setData('text/plain', content.slice(sel.start, sel.end));
    const pos = sel.start;
    apply({
      content: content.slice(0, sel.start) + content.slice(sel.end),
      selection: { start: pos, end: pos }
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>): void => {
    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    let text = html ? htmlFragmentToMarkdown(html) : plain;
    if (!text) return;
    // Stripping the coverage zero-width spaces and nbsp anchors that the
    // rendered view inserts around the real text.
    text = text.replace(/[\u200b\u200c\u200d]/g, '').replace(/\u00a0/g, ' ');
    e.preventDefault();
    apply(insertText(content, effectiveSelection(), text));
  };

  return (
    <>
    <div
      ref={rootRef}
      role="textbox"
      aria-label="Markdown editor"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-typewriter={typewriter}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      onBeforeInput={handleBeforeInput}
      onCopy={handleCopy}
      onCut={handleCut}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e: React.CompositionEvent<HTMLDivElement>) => {
        composing.current = false;
        if (e.data) apply(insertText(content, selection, e.data));
      }}
      onContextMenu={handleContextMenu}
      style={{ fontSize: `${fontSize}px` }}
      className="wysiwyg-root"
    />
      {tableMenu && (
        <>
          {/* Click-away layer */}
          <div className="fixed inset-0 z-40" onMouseDown={() => setTableMenu(null)} />
          <div
            className="table-menu fixed z-50 flex w-48 flex-col gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 text-sm shadow-lg"
            style={{ left: tableMenu.x, top: tableMenu.y }}
            onMouseDown={e => e.stopPropagation()}
            role="menu"
            aria-label="Table actions"
          >
            {(
              [
                { op: 'row-above' as TableOp, label: 'Add row above', disabled: tableMenu.row === 0 },
                { op: 'row-below' as TableOp, label: 'Add row below', disabled: false },
                { op: 'row-delete' as TableOp, label: 'Delete row', disabled: tableMenu.row === 0 || tableMenu.rows <= 1 },
                { op: 'col-before' as TableOp, label: 'Add column before', disabled: false },
                { op: 'col-after' as TableOp, label: 'Add column after', disabled: false },
                { op: 'col-delete' as TableOp, label: 'Delete column', disabled: tableMenu.cols <= 1 }
              ] as Array<{ op: TableOp; label: string; disabled: boolean }>
            ).map(item => (
              <button
                key={item.op}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => runTableOp(item.op)}
                className="rounded px-2 py-1 text-left hover:bg-[var(--menu-hover)] disabled:cursor-default disabled:opacity-40"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
});
