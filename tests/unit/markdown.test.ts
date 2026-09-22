import { describe, it, expect } from 'vitest';
import { renderMarkdown, extractHeadings } from '../../src/lib/markdown';

describe('renderMarkdown', () => {
  it('renders headings with data-bi and source offsets', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1 data-bi="0">');
    expect(html).toContain('<span data-s="2" data-e="7">Hello</span>');
  });

  it('renders bold with source offsets', () => {
    const html = renderMarkdown('**bold**');
    expect(html).toContain('<strong><span data-s="2" data-e="6">bold</span></strong>');
    // The ** markers are anchored with zero-width gap spans
    expect(html).toContain('<span data-gap data-s="0" data-e="2">\u200b\u200b</span>');
  });

  it('renders inline code', () => {
    const html = renderMarkdown('`code`');
    expect(html).toContain('<code><span data-s="1" data-e="5">code</span></code>');
    expect(html).toContain('<span data-gap data-s="0" data-e="1">\u200b</span>');
  });

  it('renders links', () => {
    const html = renderMarkdown('[t](http://x.y)');
    expect(html).toContain('<a href="http://x.y" data-link><span data-s="1" data-e="2">t</span></a>');
    // "(http://x.y)" after the link is anchored as a gap
    expect(html).toContain('<span data-gap data-s="2" data-e="15">');
  });

  it('renders strikethrough', () => {
    const html = renderMarkdown('~~x~~');
    expect(html).toContain('<del><span data-s="2" data-e="3">x</span></del>');
  });

  it('renders bullet lists', () => {
    const html = renderMarkdown('- a\n- b');
    expect(html).toContain('<ul data-bi="0">');
    expect(html).toContain('<span data-s="2" data-e="3">a</span>');
    expect(html).toContain('<span data-s="6" data-e="7">b</span>');
    // list markers and the newline between items are anchored as gaps
    expect(html).toContain('<span data-gap="prefix" data-s="0" data-e="2">\u200b\u200b</span>');
    expect(html).toContain('<span data-gap data-s="3" data-e="4">\u200b</span>');
  });

  it('renders ordered lists', () => {
    const html = renderMarkdown('1. a');
    expect(html).toContain('<ol data-bi="0">');
    expect(html).toContain('<span data-s="3" data-e="4">a</span>');
  });

  it('renders blockquotes', () => {
    const html = renderMarkdown('> q');
    expect(html).toContain('<blockquote data-bi="0">');
    expect(html).toContain('<span data-s="2" data-e="3">q</span>');
  });

  it('renders fenced code with highlight, source offsets and a copy button', () => {
    const html = renderMarkdown('```js\nlet x = 1\n```');
    expect(html).toContain('<div class="codeblock" data-bi="0">');
    expect(html).toContain('class="code-copy"');
    expect(html).toContain('<pre class="language-js">');
    expect(html).toContain('<span data-s="6" data-e="16">');
  });

  it('renders an nbsp anchor in empty table cells', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n|  |  |');
    expect(html).toContain('<td><span data-gap data-s="7" data-e="21">');
    expect(html).toContain('<span data-s="21" data-e="21">\u00a0</span></td>');
    expect(html).toContain('<span data-s="24" data-e="24">\u00a0</span></td>');
  });

  it('keeps all table gap spans inside table cells', () => {
    const html = renderMarkdown('x\n| a | b |\n|---|---|\n|  |  |');
    // Invalid HTML: inline spans as direct children of <table>/<tr> make
    // Chromium reparse the table and drop the spans outside it.
    expect(html).not.toMatch(/<table[^>]*><span data-gap/);
    expect(html).not.toMatch(/<tr><span data-gap/);
    expect(html).not.toMatch(/<\/t[hd]><span data-gap/);
    expect(html).not.toMatch(/<\/tr><span data-gap/);
    expect(html).toMatch(/<td><span data-gap/);
  });

  it('renders an nbsp anchor inside an empty fence', () => {
    const html = renderMarkdown('```\n```');
    expect(html).toContain('<span class="src-only"><span data-gap="prefix" data-s="0" data-e="4">');
    expect(html).toContain('<pre><span data-s="4" data-e="4"><code>\u00a0</code></span></pre>');
    expect(html).toContain('<span class="src-only"><span data-gap data-s="4" data-e="7">');
  });

  it('renders mermaid fences', () => {
    expect(renderMarkdown('```mermaid\ngraph TD\n```')).toContain('<pre class="mermaid" data-bi="0">');
  });

  it('renders images with exact source offsets', () => {
    const html = renderMarkdown('![alt](pic.png)');
    expect(html).toContain('<span class="img-wrap" data-s="0" data-e="15">');
    expect(html).toContain('<img src="pic.png" alt="alt" class="md-img">');
  });

  it('keeps relative srcs until a resolver supplies a data URL', () => {
    const before = renderMarkdown('![a](test_assets/x.png)', '/tmp/dir');
    expect(before).toContain('<img src="test_assets/x.png"');
    expect(before).toContain('data-abs="/tmp/dir/test_assets/x.png"');
    const after = renderMarkdown('![a](test_assets/x.png)', '/tmp/dir', (abs) =>
      abs === '/tmp/dir/test_assets/x.png' ? 'data:image/png;base64,XYZ' : null
    );
    expect(after).toContain('<img src="data:image/png;base64,XYZ"');
  });

  it('keeps URL image srcs unchanged', () => {
    expect(renderMarkdown('![](https://x.y/i.png)')).toContain('src="https://x.y/i.png"');
  });

  it('renders tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table data-bi="0">');
    expect(html).toContain('<th><span data-gap data-s="0" data-e="2">');
    expect(html).toContain('<span data-s="2" data-e="3">a</span>');
    expect(html).toContain('<td><span data-gap data-s="7" data-e="22">');
    expect(html).toContain('<span data-s="22" data-e="23">1</span>');
  });

  it('renders GFM task lists with a checkbox anchored at the x/space char', () => {
    const html = renderMarkdown('- [ ] task');
    expect(html).toContain(
      '<label class="task"><input type="checkbox" data-ck="3"></label>'
    );
    expect(html).toContain('<span data-gap="prefix" data-s="2" data-e="6">');
    expect(html).toContain('<span data-s="6" data-e="10">task</span>');
    expect(html).toContain('<li class="task-item">');
  });

  it('renders plain list items with the bullet (no task-item class)', () => {
    const html = renderMarkdown('- item');
    expect(html).toContain('<li>');
    expect(html).not.toContain('<li class="task-item">');
  });

  it('does not leak the task prefix into the following block', () => {
    // "## Heading" after a task list must render the full "Heading"
    // (a stale taskPrefix would swallow the first 4 characters).
    const html = renderMarkdown('- [ ] task\n\n## Heading');
    expect(html).toContain('<span data-s="15" data-e="22">Heading</span>');
    expect(html).toContain('<h2');
  });

  it('renders a checked task list with the checkbox pre-checked', () => {
    const html = renderMarkdown('- [x] task');
    expect(html).toContain(
      '<input type="checkbox" data-ck="3" checked>'
    );
  });

  it('anchors inline html tags so every source offset stays covered', () => {
    const html = renderMarkdown('a <u>b</u> c');
    expect(html).toContain('<span data-gap data-s="2" data-e="5">');
    expect(html).toContain('<u><span data-s="5" data-e="6">b</span>');
    expect(html).toContain('<span data-s="10" data-e="12"> c</span>');
  });

  it('renders display math via katex', () => {
    const html = renderMarkdown('$$a+b$$');
    expect(html).toContain('<span class="math" data-s="0" data-e="7">');
  });

  it('escapes html in text', () => {
    expect(renderMarkdown('a < b')).toContain('a &lt; b');
  });

  it('renders a trailing newline as an empty paragraph with source offsets', () => {
    expect(renderMarkdown('abc\n')).toBe(
      '<p data-bi="0"><span data-s="0" data-e="3">abc</span><span data-gap data-s="3" data-e="4">\u200b</span></p>' +
      '<p data-bi="1"><span data-s="4" data-e="4">\u00a0</span></p>'
    );
  });

  it('renders blank lines as visible empty lines with &nbsp;', () => {
    expect(renderMarkdown('abc\n\ndef')).toBe(
      '<p data-bi="0"><span data-s="0" data-e="3">abc</span><span data-gap data-s="3" data-e="4">\u200b</span></p>' +
      '<div data-bi="1" data-blank-line><span data-s="4" data-e="5">\u00a0</span></div>' +
      '<p data-bi="2"><span data-s="5" data-e="8">def</span></p>'
    );
  });

  it('renders each consecutive enter as a visible line', () => {
    const html = renderMarkdown('abc\n\n\n');
    const blankCount = (html.match(/data-blank-line/g) ?? []).length;
    expect(blankCount).toBe(2);
  });

  it('keeps trailing spaces at end of line representable in source offsets', () => {
    // markdown-it trims trailing line whitespace; renderMarkdown substitutes
    // no-break spaces so the trailing source position still has a DOM anchor.
    const html = renderMarkdown('line one\nline two ');
    expect(html).toContain('<span data-s="9" data-e="18">line two\u00a0</span>');
  });
});

describe('source coverage', () => {
  function spans(html: string): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    const re = /<span[^>]*data-s="(\d+)" data-e="(\d+)"[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) out.push([Number(m[1]), Number(m[2])]);
    return out;
  }

  it('covers every source offset contiguously for complex documents', () => {
    const cases = [
      'abc',
      'abc\n',
      '- a\n- b\n- c',
      '1. a\n2. b',
      '# H\nx',
      '> q\n> r',
      '  - a\n    b',
      '- a\n  b',
      'a|b\n-|-\nc|d',
      '```js\nlet x = 1;\n```',
      '**bold** and `code`',
      '[link](http://x)',
      'abc def \nxyz',
      '> - a\n> - b',
      'a\n\n\n'
    ];
    for (const src of cases) {
      const list = spans(renderMarkdown(src));
      expect(list.length).toBeGreaterThan(0);
      expect(list[0][0]).toBe(0);
      for (let i = 1; i < list.length; i++) {
        expect(list[i][0]).toBe(list[i - 1][1]);
      }
      expect(list[list.length - 1][1]).toBe(src.length);
    }
  });
});

describe('extractHeadings', () => {
  it('extracts level, text and source position', () => {
    expect(extractHeadings('# A\n## B')).toEqual([
      { level: 1, text: 'A', pos: 2 },
      { level: 2, text: 'B', pos: 7 }
    ]);
  });
});

describe('blank lines and lists', () => {
  it('a blank line after the last list item renders at the list level, not inside the last <li>', () => {
    const html = renderMarkdown('- [ ] task\n\n');
    expect(html).toContain(
      '</li><div data-bi="1" data-blank-line><span data-s="11" data-e="12">\u00a0</span></div></ul>'
    );
    const html2 = renderMarkdown('4. sda\n\n');
    expect(html2).toContain('</li><div data-bi="1" data-blank-line>');
    expect(html2.includes('</li></div>') === false).toBe(true);
  });
  it('a blank line before a nested continuation line stays inside the item', () => {
    const html = renderMarkdown('- a\n\n  b\n');
    expect(html).toContain(
      '<li><span data-gap="prefix" data-s="0" data-e="2">\u200b\u200b</span><span data-s="2" data-e="3">a</span><span data-gap data-s="3" data-e="4">\u200b</span><div data-bi="1" data-blank-line>'
    );
  });
});
