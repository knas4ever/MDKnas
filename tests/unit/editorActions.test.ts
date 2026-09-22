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
  toggleTaskList,
  indent,
  handleEnter,
  applyAction,
  applyLink,
  toggleCodeBlock,
  insertTable,
  type Selection
} from '../../src/lib/editorActions';

const S = (start: number, end: number): Selection => ({ start, end });

describe('insertText', () => {
  it('replaces selection and moves cursor', () => {
    const r = insertText('hello', S(1, 3), 'X');
    expect(r.content).toBe('hXlo');
    expect(r.selection).toEqual(S(2, 2));
  });

  it('keeps the closing fence on its own line when typing into an empty fence', () => {
    const r = insertText('```\n```', S(4, 4), 'Z');
    expect(r.content).toBe('```\nZ\n```');
    expect(r.selection).toEqual(S(5, 5));
  });

  it('does not add a newline when the text already ends with one', () => {
    const r = insertText('```\n```', S(4, 4), 'Z\n');
    expect(r.content).toBe('```\nZ\n```');
    expect(r.selection).toEqual(S(6, 6));
  });

  it('does not add a newline inside a fence with content', () => {
    const r = insertText('```\nabc\n```', S(4, 4), 'Z');
    expect(r.content).toBe('```\nZabc\n```');
    expect(r.selection).toEqual(S(5, 5));
  });

  it('typing on the blank line after a list inserts a paragraph after the blank line', () => {
    // Inserting at the blank line's own position would make the text a lazy
    // continuation of the list item (rendered inside the list).
    expect(insertText('4. sda 2ljpijpij\n\n', S(17, 17), 'x').content).toBe('4. sda 2ljpijpij\n\nx');
    // An indented continuation line below: normal insertion (lazy continuation).
    expect(insertText('- a\n\n  b\n', S(4, 4), 'x').content).toBe('- a\nx\n  b\n');
    // Non-list previous line: normal insertion.
    expect(insertText('para\n\n', S(6, 6), 'x').content).toBe('para\n\nx');
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
  it('bullets every line in a multi-line selection', () => {
    const r = toggleList('a\nb\nc', S(1, 4), false);
    expect(r.content).toBe('- a\n- b\nc');
    expect(r.selection).toEqual(S(0, 3));
  });
  it('removes bullets from every line in a multi-line selection', () => {
    const r = toggleList('- a\n- b\n- c', S(2, 10), false);
    expect(r.content).toBe('a\nb\nc');
  });
  it('numbers every line and renumbers the surrounding ordered run', () => {
    const r = toggleList('1. a\n2. b\nplain\n4. d', S(10, 14), true);
    expect(r.content).toBe('1. a\n2. b\n3. plain\n4. d');
  });
  it('replaces a different marker type on each line', () => {
    const r = toggleList('- a\n- b', S(0, 7), true);
    expect(r.content).toBe('1. a\n2. b');
  });
});

describe('applyLink', () => {
  it('wraps a selection with the given url', () => {
    const r = applyLink('hello world', S(0, 5), 'http://x');
    expect(r.content).toBe('[hello](http://x) world');
    expect(r.selection).toEqual(S(1, 6));
  });
  it('inserts a placeholder link at the caret without a selection', () => {
    const r = applyLink('ab', S(1, 1), 'u');
    expect(r.content).toBe('a[text](u)b');
    expect(r.selection).toEqual(S(2, 6));
  });
  it('falls back to a url placeholder when no url is given', () => {
    expect(applyLink('hi', S(0, 2)).content).toBe('[hi](url)');
  });
});

describe('toggleBlockquote', () => {
  it('toggles', () => {
    expect(toggleBlockquote('hi', S(1, 1)).content).toBe('> hi');
    expect(toggleBlockquote('> hi', S(3, 3)).content).toBe('hi');
  });
  it('quotes every line in a multi-line selection', () => {
    const r = toggleBlockquote('a\nb\nc', S(1, 4));
    expect(r.content).toBe('> a\n> b\nc');
    expect(r.selection).toEqual(S(0, 3));
  });
});

describe('indent', () => {
  it('indents and outdents', () => {
    const a = indent('- a', S(1, 1), false);
    expect(a.content).toBe('  - a');
    expect(indent(a.content, S(3, 3), true).content).toBe('- a');
  });
});

describe('toggleCodeBlock', () => {
  it('wraps a selected line in a fence', () => {
    const r = toggleCodeBlock('a\nfoo\nb', S(2, 5));
    expect(r.content).toBe('a\n```\nfoo\n```\nb');
  });

  it('wraps every line of a multi-line selection', () => {
    const r = toggleCodeBlock('x\nfoo\nbar\ny', S(2, 9));
    expect(r.content).toBe('x\n```\nfoo\nbar\n```\ny');
  });

  it('removes the fence when the caret is inside a code block', () => {
    const r = toggleCodeBlock('a\n```\nfoo\n```\nb', S(6, 9));
    expect(r.content).toBe('a\nfoo\nb');
  });

  it('wraps the caret line when it is non-empty', () => {
    const r = toggleCodeBlock('one\ntwo', S(4, 4));
    expect(r.content).toBe('one\n```\ntwo\n```');
  });

  it('makes an empty block from a caret on an empty line', () => {
    const r = toggleCodeBlock('one\n\ntwo', S(4, 4));
    expect(r.content).toBe('one\n```\n\n```\ntwo');
  });
});

describe('insertTable', () => {
  it('inserts a 2x3 table at the caret', () => {
    const r = insertTable('before', S(6, 6), 2, 3);
    expect(r.content).toBe(
      'before\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|    |    |    |'
    );
  });

  it('adds surrounding newlines mid-line', () => {
    const r = insertTable('ab', S(1, 1), 1, 1);
    expect(r.content).toBe('a\n| Column 1 |\n| --- |\nb');
  });

  it('selects the inserted table', () => {
    const r = insertTable('', S(0, 0), 1, 2);
    expect(r.selection.start).toBe(0);
    expect(r.selection.end).toBe(r.content.length);
  });

  it('goes through applyAction with a rows,cols arg', () => {
    const r = applyAction('x', S(0, 0), 'table', '3,2');
    expect(r.content).toBe(
      '| Column 1 | Column 2 |\n| --- | --- |\n|    |    |\n|    |    |\nx'
    );
  });
});

describe('handleEnter', () => {
  it('continues list', () => {
    const r = handleEnter('- a', S(3, 3));
    expect(r.content).toBe('- a\n- ');
    expect(r.selection).toEqual(S(6, 6));
  });
  it('exits empty list item', () => {
    expect(handleEnter('- \n', S(2, 2)).content).toBe('');
  });
  it('ends the list on Enter in an empty task item', () => {
    // The item line is removed INCLUDING its newline: no stray blank line.
    expect(handleEnter('- [ ] \npara', S(6, 6)).content).toBe('para');
    const r = handleEnter('- [ ] task\n- [ ] \n', S(14, 14));
    expect(r.content).toBe('- [ ] task\n');
    expect(r.selection).toEqual({ start: 11, end: 11 });
    // Mid-document: the following line takes the item's place.
    const r2 = handleEnter('A\n- [ ] \nB', S(4, 4));
    expect(r2.content).toBe('A\nB');
    expect(r2.selection).toEqual({ start: 2, end: 2 });
  });
  it('ends the list when Enter is pressed on the empty line below an empty item', () => {
    // Caret at the very end of the document: the empty line that visually
    // belongs to the last (empty) task item.
    const r = handleEnter('- [ ] task\n- [ ] \n', S(18, 18));
    expect(r.content).toBe('- [ ] task\n');
    expect(r.selection).toEqual({ start: 11, end: 11 });
    // A non-empty item above is left alone.
    const r2 = handleEnter('- item\n\n', S(7, 7));
    expect(r2.content).toBe('- item\n\n\n');
  });
  it('continues a non-empty task with a fresh checkbox', () => {
    const r = handleEnter('- [ ] task', S(10, 10));
    expect(r.content).toBe('- [ ] task\n- [ ] ');
    expect(r.selection).toEqual({ start: 17, end: 17 });
  });
  it('increments ordered list numbers', () => {
    expect(handleEnter('1. a', S(4, 4)).content).toBe('1. a\n2. ');
    expect(handleEnter('10) a', S(5, 5)).content).toBe('10) a\n11) ');
  });
  it('continues task lists with an unchecked checkbox', () => {
    expect(handleEnter('- [ ] a', S(7, 7)).content).toBe('- [ ] a\n- [ ] ');
    expect(handleEnter('- [x] a', S(7, 7)).content).toBe('- [x] a\n- [ ] ');
    expect(handleEnter('1. [ ] a', S(9, 9)).content).toBe('1. [ ] a\n2. [ ] ');
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
  it('strikethrough wraps', () => {
    expect(applyAction('say hi', S(4, 6), 'strikethrough').content).toBe(
      'say ~~hi~~'
    );
  });
  it('underline wraps', () => {
    expect(applyAction('say hi', S(4, 6), 'underline').content).toBe(
      'say <u>hi</u>'
    );
  });
  it('highlight wraps', () => {
    expect(applyAction('say hi', S(4, 6), 'highlight').content).toBe(
      'say <mark>hi</mark>'
    );
  });
  it('underline unwraps existing underline', () => {
    expect(applyAction('a <u>x</u> b', S(5, 6), 'underline').content).toBe(
      'a x b'
    );
  });
});

describe('toggleTaskList', () => {
  it('turns a plain line into a task item', () => {
    expect(toggleTaskList('task', S(0, 4)).content).toBe('- [ ] task');
  });
  it('adds a checkbox to a plain list item', () => {
    expect(toggleTaskList('- item', S(0, 6)).content).toBe('- [ ] item');
  });
  it('toggles an unchecked task to checked', () => {
    expect(toggleTaskList('- [ ] task', S(6, 10)).content).toBe('- [x] task');
  });
  it('toggles a checked task to unchecked', () => {
    expect(toggleTaskList('- [x] task', S(6, 10)).content).toBe('- [ ] task');
  });
  it('works on ordered list items', () => {
    expect(toggleTaskList('1. item', S(0, 7)).content).toBe('1. [ ] item');
  });
  it('applies to every selected line and stops at line boundaries', () => {
    expect(toggleTaskList('a\n\nb', S(0, 3)).content).toBe('- [ ] a\n\nb');
  });
  it('applies to multi-line selections', () => {
    expect(toggleTaskList('one\ntwo', S(0, 5)).content).toBe(
      '- [ ] one\n- [ ] two'
    );
  });
});
