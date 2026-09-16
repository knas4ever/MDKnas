import { describe, it, expect } from 'vitest';
import { renderMarkdown, extractHeadings } from '../../src/lib/markdown';

describe('renderMarkdown', () => {
  it('renders headings with data-bi and source offsets', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1 data-bi="0">');
    expect(html).toContain('<span data-s="2" data-e="7">Hello</span>');
  });

  it('renders bold with source offsets', () => {
    expect(renderMarkdown('**bold**')).toBe(
      '<p data-bi="0"><strong><span data-s="2" data-e="6">bold</span></strong></p>'
    );
  });

  it('renders inline code', () => {
    expect(renderMarkdown('`code`')).toBe(
      '<p data-bi="0"><code><span data-s="1" data-e="5">code</span></code></p>'
    );
  });

  it('renders links', () => {
    expect(renderMarkdown('[t](http://x.y)')).toBe(
      '<p data-bi="0"><a href="http://x.y" data-link><span data-s="1" data-e="2">t</span></a></p>'
    );
  });

  it('renders strikethrough', () => {
    expect(renderMarkdown('~~x~~')).toBe(
      '<p data-bi="0"><del><span data-s="2" data-e="3">x</span></del></p>'
    );
  });

  it('renders bullet lists', () => {
    const html = renderMarkdown('- a\n- b');
    expect(html).toContain('<ul data-bi="0">');
    expect(html).toContain('<li><span data-s="2" data-e="3">a</span></li>');
    expect(html).toContain('<li><span data-s="6" data-e="7">b</span></li>');
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

  it('renders fenced code with highlight and source offsets', () => {
    const html = renderMarkdown('```js\nlet x = 1\n```');
    expect(html).toContain('<pre data-bi="0">');
    expect(html).toContain('class="language-js"');
    expect(html).toContain('<span data-s="6" data-e="15">');
  });

  it('renders mermaid fences', () => {
    expect(renderMarkdown('```mermaid\ngraph TD\n```')).toContain('<pre class="mermaid" data-bi="0">');
  });

  it('renders tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table data-bi="0">');
    expect(html).toContain('<th><span data-s="2" data-e="3">a</span></th>');
    expect(html).toContain('<td><span data-s="22" data-e="23">1</span></td>');
  });

  it('renders display math via katex', () => {
    const html = renderMarkdown('$$a+b$$');
    expect(html).toContain('<span class="math" data-s="0" data-e="7">');
  });

  it('escapes html in text', () => {
    expect(renderMarkdown('a < b')).toContain('a &lt; b');
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
