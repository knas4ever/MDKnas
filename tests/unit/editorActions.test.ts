import { describe, it, expect } from 'vitest';
import {
  insertText,
  backspace,
  deleteForward,
  autoPairInsert,
  wrapSelection,
  toggleHeading,
  toggleList,
  toggleBlockquote,
  indent,
  handleEnter,
  applyAction,
  type Selection
} from '../../src/lib/editorActions';

const S = (start: number, end: number): Selection => ({ start, end });

describe('insertText', () => {
  it('replaces selection and moves cursor', () => {
    const r = insertText('hello', S(1, 3), 'X');
    expect(r.content).toBe('hXlo');
    expect(r.selection).toEqual(S(2, 2));
  });
});

describe('backspace', () => {
  it('deletes selection', () => {
    expect(backspace('hello', S(1, 3))).toEqual({ content: 'hlo', selection: S(1, 1) });
  });
  it('deletes char before cursor', () => {
    expect(backspace('hello', S(3, 3))).toEqual({ content: 'helo', selection: S(2, 2) });
  });
});

describe('deleteForward', () => {
  it('deletes char at cursor', () => {
    expect(deleteForward('hello', S(2, 2))).toEqual({ content: 'helo', selection: S(2, 2) });
  });
});

describe('autoPairInsert', () => {
  it('wraps paired char with closing pair', () => {
    const r = autoPairInsert('ab', S(1, 1), '(');
    expect(r.content).toBe('a()b');
    expect(r.selection).toEqual(S(2, 2));
  });
  it('skips existing closing char', () => {
    const r = autoPairInsert('a)', S(1, 1), '(');
    expect(r.content).toBe('a)');
    expect(r.selection).toEqual(S(2, 2));
  });
  it('passes through unpaired text', () => {
    expect(autoPairInsert('ab', S(1, 1), 'x')).toEqual({ content: 'axb', selection: S(2, 2) });
  });
});

describe('wrapSelection', () => {
  it('wraps selection', () => {
    const r = wrapSelection('hello', S(1, 4), '**', '**');
    expect(r.content).toBe('h**ell**o');
    expect(r.selection).toEqual(S(3, 6));
  });
  it('unwraps when markers surround selection', () => {
    const r = wrapSelection('h**ell**o', S(3, 6), '**', '**');
    expect(r.content).toBe('hello');
    expect(r.selection).toEqual(S(1, 4));
  });
  it('wraps plain selection with strikethrough', () => {
    expect(wrapSelection('hello', S(1, 4), '~~', '~~').content).toBe('h~~ell~~o');
  });
});

describe('toggleHeading', () => {
  it('adds heading', () => {
    expect(toggleHeading('hello', S(1, 1), 2).content).toBe('## hello');
  });
  it('removes heading of same level', () => {
    expect(toggleHeading('## hello', S(3, 3), 2).content).toBe('hello');
  });
  it('changes level', () => {
    expect(toggleHeading('## hello', S(3, 3), 1).content).toBe('# hello');
  });
});

describe('toggleList', () => {
  it('adds bullet', () => {
    expect(toggleList('hello', S(1, 1), false).content).toBe('- hello');
  });
  it('removes bullet', () => {
    expect(toggleList('- hello', S(2, 2), false).content).toBe('hello');
  });
  it('adds ordered', () => {
    expect(toggleList('hello', S(1, 1), true).content).toBe('1. hello');
  });
});

describe('toggleBlockquote', () => {
  it('toggles', () => {
    expect(toggleBlockquote('hi', S(1, 1)).content).toBe('> hi');
    expect(toggleBlockquote('> hi', S(3, 3)).content).toBe('hi');
  });
});

describe('indent', () => {
  it('indents and outdents', () => {
    const a = indent('- a', S(1, 1), false);
    expect(a.content).toBe('  - a');
    expect(indent(a.content, S(3, 3), true).content).toBe('- a');
  });
});

describe('handleEnter', () => {
  it('continues list', () => {
    const r = handleEnter('- a', S(3, 3));
    expect(r.content).toBe('- a\n- ');
    expect(r.selection).toEqual(S(6, 6));
  });
  it('exits empty list item', () => {
    expect(handleEnter('- \n', S(2, 2)).content).toBe('\n');
  });
  it('continues blockquote', () => {
    expect(handleEnter('> a', S(3, 3)).content).toBe('> a\n> ');
  });
  it('plain newline', () => {
    expect(handleEnter('ab', S(2, 2)).content).toBe('ab\n');
  });
});

describe('applyAction', () => {
  it('bold wraps', () => {
    expect(applyAction('hello', S(1, 4), 'bold').content).toBe('h**ell**o');
  });
  it('link wraps', () => {
    expect(applyAction('text', S(0, 4), 'link').content).toBe('[text](url)');
  });
});
