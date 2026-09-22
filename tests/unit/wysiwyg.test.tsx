import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { useState } from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import WysiwygEditor, { WysiwygEditorHandle } from '../../src/components/WysiwygEditor';
import type { Selection } from '../../src/lib/editorActions';

function typeChar(box: HTMLElement, data: string): void {
  // jsdom's CompositionEvent does not bubble by default (unlike browsers),
  // so mark it composed/bubbling so React's root listener receives it.
  fireEvent(box, new CompositionEvent('compositionstart', { data: '', bubbles: true }));
  fireEvent(box, new CompositionEvent('compositionend', { data, bubbles: true }));
}

function Harness({
  editorRef,
  initial = '',
  initialSel
}: {
  editorRef: React.Ref<WysiwygEditorHandle>;
  initial?: string;
  initialSel?: Selection;
}) {
  const [content, setContent] = useState(initial);
  const [selection, setSelection] = useState<Selection>(
    initialSel ?? { start: 0, end: 0 }
  );
  const onChange = (c: string, s: Selection) => {
    setContent(c);
    setSelection(s);
  };
  return <WysiwygEditor ref={editorRef} content={content} selection={selection} onChange={onChange} />;
}

describe('WysiwygEditor', () => {
  afterEach(cleanup);

  it('renders typed text live with source offsets', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} />);
    const box = h.getByRole('textbox');
    typeChar(box, 'a');
    expect(box.innerHTML).toContain('<span data-s="0" data-e="1">a</span>');
  });

  it('backspace removes the previous character', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} />);
    const box = h.getByRole('textbox');
    typeChar(box, 'a');
    fireEvent.keyDown(box, { key: 'Backspace' });
    expect(box.innerHTML).toBe('');
  });

  it('ctrl+b wraps the DOM selection', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} />);
    const box = h.getByRole('textbox');
    typeChar(box, 'a');
    typeChar(box, 'b');
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(box);
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(box, { key: 'b', ctrlKey: true });
    expect(box.innerHTML).toContain('<strong><span data-s="2" data-e="4">ab</span></strong>');
  });

  it('enter at the end of a line creates a new line', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} />);
    const box = h.getByRole('textbox');
    typeChar(box, 'a');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(box.innerHTML).toContain('<p data-bi="1"><span data-s="2" data-e="2">');
  });

  it('execute() applies actions from the toolbar', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} />);
    const box = h.getByRole('textbox');
    typeChar(box, 'x');
    act(() => {
      ref.current?.execute('bold');
    });
    expect(box.innerHTML).toContain('<strong><span data-s="2" data-e="3">x</span></strong>');
  });

  it('copy puts the raw markdown of the selection on the clipboard', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(
      <Harness editorRef={ref} initial="a **b** c" initialSel={{ start: 2, end: 7 }} />
    );
    const box = h.getByRole('textbox');
    const setData = vi.fn();
    fireEvent.copy(box, {
      clipboardData: { setData } as unknown as DataTransfer
    });
    expect(setData).toHaveBeenCalledWith('text/plain', '**b**');
  });

  it('cut removes the selection and copies raw markdown', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(
      <Harness editorRef={ref} initial="aa bb" initialSel={{ start: 3, end: 5 }} />
    );
    const box = h.getByRole('textbox');
    const setData = vi.fn();
    fireEvent.cut(box, {
      clipboardData: { setData } as unknown as DataTransfer
    });
    expect(setData).toHaveBeenCalledWith('text/plain', 'bb');
    expect(box.textContent.replace(/\s/g, '')).toBe('aa');
  });

  it('paste inserts text into the document', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} />);
    const box = h.getByRole('textbox');
    typeChar(box, 'a');
    fireEvent.paste(box, {
      clipboardData: {
        getData: (t: string) => (t === 'text/plain' ? 'BC' : '')
      } as unknown as DataTransfer
    });
    expect(box.innerHTML).toContain('BC');
  });

  it('pasting rich html converts formatting back to markdown', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} initial="a" />);
    const box = h.getByRole('textbox');
    fireEvent.paste(box, {
      clipboardData: {
        getData: (t: string) =>
          t === 'text/html' ? '<strong>BC</strong>' : 'BC'
      } as unknown as DataTransfer
    });
    expect(box.innerHTML).toContain('<strong>');
    expect(box.innerHTML).toContain('BC');
  });

  it('clicking a task-list checkbox toggles the source character', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(<Harness editorRef={ref} initial="- [ ] task" />);
    const cb = h.container.querySelector('input[type="checkbox"]');
    expect(cb).toBeTruthy();
    fireEvent.click(cb!);
    expect(h.getByRole('textbox').innerHTML).toContain(
      'data-ck="3" checked'
    );
  });

  it('clicking a link opens it via openExternal', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const openExternal = vi.fn();
    const w = window as Window & { api: { openExternal: (u: string) => void } };
    const origApi = w.api;
    w.api = { openExternal };
    const h = render(<Harness editorRef={ref} initial="[a](https://ex.com)" />);
    fireEvent.click(h.getByRole('link'));
    expect(openExternal).toHaveBeenCalledWith('https://ex.com/');
    w.api = origApi;
  });

  it('backspace removes a whole image when the caret is after it', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(
      <Harness editorRef={ref} initial="![](img.png)" initialSel={{ start: 11, end: 11 }} />
    );
    const box = h.getByRole('textbox');
    fireEvent.keyDown(box, { key: 'Backspace' });
    expect(box.textContent).toBe('');
  });

  it('delete removes a whole image when the caret is at its start', () => {
    const ref = React.createRef<WysiwygEditorHandle>();
    const h = render(
      <Harness editorRef={ref} initial="![](img.png) x" initialSel={{ start: 0, end: 0 }} />
    );
    const box = h.getByRole('textbox');
    fireEvent.keyDown(box, { key: 'Delete' });
    expect(box.textContent).not.toContain('img.png');
    expect(box.textContent).toContain('x');
  });
});
