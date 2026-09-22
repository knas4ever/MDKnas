import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/lib/markdown';
import { domSelectionToSource, sourceToDomSelection } from '../../src/lib/cursor';

function makeRoot(html: string): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('cursor', () => {
  it('sourceToDomSelection places cursor in the right text node', () => {
    const root = makeRoot(renderMarkdown('# Hello'));
    expect(sourceToDomSelection(root, { start: 2, end: 7 })).toBe(true);
    const sel = window.getSelection()!;
    expect(sel.anchorNode?.nodeValue).toBe('Hello');
    expect(sel.anchorOffset).toBe(0);
  });

  it('domSelectionToSource maps back into the source range (approximate)', () => {
    const root = makeRoot(renderMarkdown('# Hello **bold**'));
    const node = root.querySelector('span[data-s="2"]')!.firstChild as Text;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(node, 2);
    range.setEnd(node, 2);
    sel.removeAllRanges();
    sel.addRange(range);
    const mapped = domSelectionToSource(root, {
      anchorNode: node,
      anchorOffset: 2,
      focusNode: node,
      focusOffset: 2
    });
    expect(mapped.start).toBeGreaterThanOrEqual(2);
    expect(mapped.start).toBeLessThanOrEqual(7);
    expect(mapped.end).toBe(mapped.start);
  });

  it('falls back to false when there are no text runs', () => {
    expect(sourceToDomSelection(makeRoot(''), { start: 0, end: 0 })).toBe(false);
  });

  it('round-trips a caret placed after a trailing space', () => {
    const content = 'line one\nline two ';
    const root = makeRoot(renderMarkdown(content));
    expect(
      sourceToDomSelection(root, { start: content.length, end: content.length })
    ).toBe(true);
    const sel = window.getSelection()!;
    const r = sel.getRangeAt(0);
    const mapped = domSelectionToSource(root, {
      anchorNode: r.startContainer,
      anchorOffset: r.startOffset,
      focusNode: r.endContainer,
      focusOffset: r.endOffset
    });
    expect(mapped.start).toBe(content.length);
    expect(mapped.end).toBe(content.length);
  });

  it('maps offsets inside bold text', () => {
    const root = makeRoot(renderMarkdown('**bold**'));
    sourceToDomSelection(root, { start: 4, end: 4 });
    const sel = window.getSelection()!;
    const node = root.querySelector('span[data-s="2"]')!.firstChild as Text;
    expect(sel.anchorNode).toBe(node);
    expect(sel.anchorOffset).toBe(2);
  });

  it('element anchors inside a table cell skip leading gap spans', () => {
    const root = makeRoot(
      '<table><tr><td><span data-gap data-s="0" data-e="5">' +
        '\u200b\u200b\u200b\u200b\u200b</span><span data-s="5" data-e="5">\u00a0</span></td></tr></table>'
    );
    const td = root.querySelector('td')!;
    const mapped = domSelectionToSource(root, {
      anchorNode: td,
      anchorOffset: 0,
      focusNode: td,
      focusOffset: 0
    });
    expect(mapped.start).toBe(5);
    expect(mapped.end).toBe(5);
  });
});
