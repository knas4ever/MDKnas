import { describe, it, expect } from 'vitest';
import { htmlFragmentToMarkdown } from '../../src/lib/clipboardMd';

describe('htmlFragmentToMarkdown', () => {
  it('converts formatting tags to markdown', () => {
    expect(htmlFragmentToMarkdown('<strong>a</strong>')).toBe('**a**');
    expect(htmlFragmentToMarkdown('<em>a</em>')).toBe('*a*');
    expect(htmlFragmentToMarkdown('<s>a</s>')).toBe('~~a~~');
    expect(htmlFragmentToMarkdown('<u>a</u>')).toBe('<u>a</u>');
    expect(htmlFragmentToMarkdown('<mark>a</mark>')).toBe('<mark>a</mark>');
    expect(htmlFragmentToMarkdown('<code>a</code>')).toBe('`a`');
  });

  it('converts links to markdown links', () => {
    expect(htmlFragmentToMarkdown('<a href="https://x.com">a</a>')).toBe(
      '[a](https://x.com)'
    );
  });

  it('flattens containers and keeps line breaks', () => {
    expect(htmlFragmentToMarkdown('<div>a<br>b</div>')).toBe('a\nb');
    expect(htmlFragmentToMarkdown('<p>a</p><p>b</p>')).toBe('a\nb\n');
    expect(htmlFragmentToMarkdown('<div><strong>bo</strong>ld</div>')).toBe(
      '**bo**ld'
    );
  });

  it('returns plain text for unstyled fragments', () => {
    expect(htmlFragmentToMarkdown('<div>hello</div>')).toBe('hello');
  });
});
