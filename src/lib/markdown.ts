import MarkdownIt from 'markdown-it';

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

export function parseMarkdown(content: string): string {
  return md.render(content);
}
