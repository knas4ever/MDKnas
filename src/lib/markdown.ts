import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import katex from 'katex';

const md = new MarkdownIt({ html: true, typographer: false, breaks: false });

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function lineStarts(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function textSpan(text: string, s: number, e: number): string {
  return `<span data-s="${s}" data-e="${e}">${escapeHtml(text)}</span>`;
}

function mathSpan(latex: string, s: number, e: number): string {
  const html = katex.renderToString(latex, { displayMode: true, throwOnError: false });
  return `<span class="math" data-s="${s}" data-e="${e}">${html}</span>`;
}

interface InlineCtx {
  pos: number;
}

function renderInline(tokens: MarkdownIt.Token[], ctx: InlineCtx): string {
  let out = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text': {
        if (t.content === '') break;
        const mathM = t.content.match(/^\$\$([\s\S]+?)\$\$/);
        if (mathM) {
          out += mathSpan(mathM[1], ctx.pos, ctx.pos + t.content.length);
        } else {
          out += textSpan(t.content, ctx.pos, ctx.pos + t.content.length);
        }
        ctx.pos += t.content.length;
        break;
      }
      case 'code_inline': {
        out += `<code>${textSpan(t.content, ctx.pos + 1, ctx.pos + t.content.length + 1)}</code>`;
        ctx.pos += t.content.length + 2;
        break;
      }
      case 'em_open':
      case 'strong_open':
      case 's_open': {
        const tag = t.type === 'em_open' ? 'em' : t.type === 'strong_open' ? 'strong' : 'del';
        ctx.pos += t.markup.length;
        out += `<${tag}>`;
        break;
      }
      case 'em_close':
      case 'strong_close':
      case 's_close': {
        const tag = t.type === 'em_close' ? 'em' : t.type === 'strong_close' ? 'strong' : 'del';
        ctx.pos += t.markup.length;
        out += `</${tag}>`;
        break;
      }
      case 'link_open': {
        const href = t.attrs?.find(a => a[0] === 'href')?.[1] ?? '';
        out += `<a href="${escAttr(href)}" data-link>`;
        ctx.pos += 1;
        break;
      }
      case 'link_close': {
        const href = t.attrs?.find(a => a[0] === 'href')?.[1] ?? '';
        ctx.pos += 2 + href.length + 1;
        out += '</a>';
        break;
      }
      case 'image': {
        ctx.pos += 2 + t.content.length + 1 + (t.src ?? '').length + 1;
        out += `<img src="${escAttr(t.src ?? '')}" alt="${escAttr(t.content)}">`;
        break;
      }
      case 'html_inline': {
        out += t.content;
        ctx.pos += t.content.length;
        break;
      }
      case 'softbreak':
      case 'hardbreak': {
        out += '<br>';
        ctx.pos += t.type === 'hardbreak' ? 3 : 1;
        break;
      }
    }
  }
  return out;
}

function cellContentStarts(line: string): number[] {
  const out: number[] = [];
  let i = line.startsWith('|') ? 1 : 0;
  for (;;) {
    if (i >= line.length) break;
    let j = i;
    while (j < line.length && line[j] !== '|') {
      j += line[j] === '\\' ? 2 : 1;
    }
    const cell = line.slice(i, Math.min(j, line.length));
    let off = 0;
    while (off < cell.length && cell[off] === ' ') off += 1;
    out.push(i + off);
    if (j >= line.length) break;
    i = j + 1;
  }
  return out;
}

function renderFence(t: MarkdownIt.Token, starts: number[], content: string, bi: number): string {
  const [ls, le] = t.map!;
  const s = starts[ls + 1];
  const e = le - 1 < starts.length ? starts[le - 1] - 1 : content.length;
  const lang = t.info || '';
  const body = t.content;
  if (lang === 'mermaid') {
    return `<pre class="mermaid" data-bi="${bi}"><span data-s="${s}" data-e="${e}"><code>${escapeHtml(
      body
    )}</code></span></pre>`;
  }
  let code: string;
  let cls = '';
  if (lang && hljs.getLanguage(lang)) {
    code = hljs.highlight(body, { language: lang, ignoreIllegals: true }).value;
    cls = ` class="language-${lang}"`;
  } else {
    code = escapeHtml(body);
  }
  return `<pre data-bi="${bi}"><span data-s="${s}" data-e="${e}"><code${cls}>${code}</code></span></pre>`;
}

export function renderMarkdown(content: string): string {
  const tokens = md.parse(content);
  const starts = lineStarts(content);
  let bi = 0;
  let html = '';
  let prefix = 0;
  const prefixStack: number[] = [];
  let inListItem = false;
  let cellIdx = 0;
  let rowStart = 0;
  let cellStarts: number[] = [];
  let inlinePos0 = 0;
  const nextBi = () => bi++;

  const lineText = (i: number): string =>
    content.slice(starts[i], i + 1 < starts.length ? starts[i + 1] - 1 : content.length);

  for (const t of tokens) {
    switch (t.type) {
      case 'heading_open':
        inlinePos0 = starts[t.map![0]] + t.markup.length + 1;
        html += `<${t.tag} data-bi="${nextBi()}">`;
        break;
      case 'inline':
        html += renderInline(t.children ?? [], { pos: inlinePos0 });
        break;
      case 'heading_close':
        html += `</${t.tag}>`;
        break;
      case 'paragraph_open':
        inlinePos0 = starts[t.map![0]] + prefix;
        if (!inListItem) html += `<p data-bi="${nextBi()}">`;
        break;
      case 'paragraph_close':
        if (!inListItem) html += '</p>';
        break;
      case 'blockquote_open': {
        const m = lineText(t.map![0]).match(/^>[\t ]?/);
        const add = m ? m[0].length : 0;
        prefixStack.push(add);
        prefix += add;
        html += `<blockquote data-bi="${nextBi()}">`;
        break;
      }
      case 'blockquote_close': {
        prefix -= prefixStack.pop() ?? 0;
        html += '</blockquote>';
        break;
      }
      case 'bullet_list_open':
        html += `<ul data-bi="${nextBi()}">`;
        break;
      case 'bullet_list_close':
        html += '</ul>';
        break;
      case 'ordered_list_open':
        html += `<ol data-bi="${nextBi()}">`;
        break;
      case 'ordered_list_close':
        html += '</ol>';
        break;
      case 'list_item_open': {
        const m = lineText(t.map![0]).match(/^(\s*)([-*+]|\d+[.)])([\t ]+)/);
        const add = m ? m[0].length : 0;
        prefixStack.push(add);
        prefix += add;
        inListItem = true;
        html += '<li>';
        break;
      }
      case 'list_item_close': {
        prefix -= prefixStack.pop() ?? 0;
        inListItem = false;
        html += '</li>';
        break;
      }
      case 'fence':
        html += renderFence(t, starts, content, nextBi());
        break;
      case 'table_open':
        html += `<table data-bi="${nextBi()}">`;
        break;
      case 'table_close':
        html += '</table>';
        break;
      case 'thead_open':
        html += '<thead>';
        break;
      case 'thead_close':
        html += '</thead>';
        break;
      case 'tbody_open':
        html += '<tbody>';
        break;
      case 'tbody_close':
        html += '</tbody>';
        break;
      case 'tr_open':
        cellIdx = 0;
        rowStart = starts[t.map![0]];
        cellStarts = cellContentStarts(lineText(t.map![0]));
        html += '<tr>';
        break;
      case 'tr_close':
        html += '</tr>';
        break;
      case 'th_open':
        inlinePos0 = rowStart + (cellStarts[cellIdx] ?? 0);
        cellIdx += 1;
        html += '<th>';
        break;
      case 'th_close':
        html += '</th>';
        break;
      case 'td_open':
        inlinePos0 = rowStart + (cellStarts[cellIdx] ?? 0);
        cellIdx += 1;
        html += '<td>';
        break;
      case 'td_close':
        html += '</td>';
        break;
      case 'html_block':
        html += t.content;
        break;
    }
  }
  return html;
}

export interface Heading {
  level: number;
  text: string;
  pos: number;
}

export function extractHeadings(content: string): Heading[] {
  const tokens = md.parse(content);
  const starts = lineStarts(content);
  const out: Heading[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open' && t.map) {
      const next = tokens[i + 1];
      const text =
        next && next.type === 'inline' && next.children
          ? next.children.map(c => c.content).join('')
          : '';
      out.push({
        level: Number(t.tag.slice(1)),
        text,
        pos: starts[t.map[0]] + t.markup.length + 1
      });
    }
  }
  return out;
}
