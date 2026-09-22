import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
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

// markdown-it trims trailing whitespace from paragraph lines, which would
// leave those source positions unrepresentable in the DOM (the caret could
// not be placed after a trailing space). Replace trailing spaces/tabs with
// no-break spaces: same length, same rendered width, never trimmed.
// Exception: a line consisting only of a block marker ("# ", "> ", "- ",
// "1. ") must keep its literal space, because markdown-it's marker regexes
// require [ \t] after the marker — an nbsp would make the line parse as
// lazy continuation text of the previous block.
function renderSource(content: string): string {
  const lines = content.split('\n');
  return lines
    .map(line => {
      if (/^\s*(#{1,6}|>|(?:[-*+]|\d+[.)]))[\t ]*$/.test(line)) return line;
      return line.replace(/[ \t]+$/g, m => '\u00a0'.repeat(m.length));
    })
    .join('\n');
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

// Invisible anchor for source positions that have no rendered character of
// their own (markers, prefixes, pipes, newlines). One zero-width space per
// source character keeps the offset-to-position mapping exact. line-height:0
// (via [data-gap]) keeps a leaked gap from creating a visible line box.
// prefix=true marks line prefixes (markers, "## ", checkboxes, fence open):
// the caret must snap past them, never land inside the markup.
function gapSpan(s: number, e: number, prefix = false): string {
  const attr = prefix ? 'data-gap="prefix"' : 'data-gap';
  return `<span ${attr} data-s="${s}" data-e="${e}">${'\u200b'.repeat(e - s)}</span>`;
}

// Visible anchor for lines that would otherwise be empty (an empty list
// item's marker, a trailing empty line): one &nbsp; per source character so
function mathSpan(latex: string, s: number, e: number): string {
  const html = katex.renderToString(latex, { displayMode: true, throwOnError: false });
  return `<span class="math" data-s="${s}" data-e="${e}">${html}</span>`;
}

interface InlineCtx {
  out: string;
  pos: number;
  starts: number[];
  ls: number;
  lineIdx: number;
  lineGap: (relLine: number) => number;
  // Task-list prefix ("[ ] " / "[x] ") stripped from the first inline text
  // of a list item; the checkbox input replaces it visually.
  taskPrefix: number;
  // Set while continuation lines of a task item are wrapped in .li-cont.
  contOpen: boolean;
  // True once the inline rendered real (non-markup) content; used to
  // detect list items whose paragraphs are empty and need an anchor.
  hasRealContent: boolean;
  // Directory of the current document, used to resolve relative image srcs.
  baseDir?: string;
  // Resolves an absolute image path to a loadable src (data URL). The
  // editor caches these and re-renders when new entries arrive.
  resolveImg?: (abs: string) => string | null;
}

function inlineGap(ctx: InlineCtx, target: number): void {
  if (target > ctx.pos) {
    ctx.out += gapSpan(ctx.pos, target, true);
    ctx.pos = target;
  }
}

// Renders the inline children of a multi-line paragraph. `lineGap(relLine)`
// is how many leading source characters markdown-it stripped from the line
// relative to the paragraph's first line (blockquote "> ", the list marker,
// or a continuation-line indent). All stripped characters are re-anchored
// with zero-width spans so every source offset in the paragraph has a DOM
// position.
function renderInline(tokens: Token[], ctx: InlineCtx): string {
  ctx.lineIdx = 0;
  let lastHref = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text': {
        const start = ctx.pos;
        let c = t.content;
        let p = start;
        if (ctx.taskPrefix > 0 && ctx.lineIdx === 0) {
          p += ctx.taskPrefix;
          c = c.slice(ctx.taskPrefix);
        }
        if (p > start) {
          // The stripped task-list prefix ("[ ] ") always needs a DOM anchor,
          // even when the item text is empty (a bare checkbox would
          // otherwise leave an uncoverable hole and an unclickable line).
          ctx.out += gapSpan(start, p, true);
        }
        if (c !== '') {
          ctx.hasRealContent = true;
          const mathM = c.match(/^\$\$([\s\S]+?)\$\$/);
          if (mathM) {
            ctx.out += mathSpan(mathM[1], p, p + c.length);
          } else {
            ctx.out += textSpan(c, p, p + c.length);
          }
        }
        ctx.pos = start + t.content.length;
        break;
      }
      case 'code_inline': {
        ctx.hasRealContent = true;
        ctx.out += gapSpan(ctx.pos, ctx.pos + 1);
        ctx.out += `<code>${textSpan(t.content, ctx.pos + 1, ctx.pos + t.content.length + 1)}</code>`;
        ctx.out += gapSpan(ctx.pos + t.content.length + 1, ctx.pos + t.content.length + 2);
        ctx.pos += t.content.length + 2;
        break;
      }
      case 'em_open':
      case 'strong_open':
      case 's_open': {
        const tag = t.type === 'em_open' ? 'em' : t.type === 'strong_open' ? 'strong' : 'del';
        ctx.out += gapSpan(ctx.pos, ctx.pos + t.markup.length);
        ctx.out += `<${tag}>`;
        ctx.pos += t.markup.length;
        break;
      }
      case 'em_close':
      case 'strong_close':
      case 's_close': {
        const tag = t.type === 'em_close' ? 'em' : t.type === 'strong_close' ? 'strong' : 'del';
        ctx.out += `</${tag}>`;
        ctx.out += gapSpan(ctx.pos, ctx.pos + t.markup.length);
        ctx.pos += t.markup.length;
        break;
      }
      case 'link_open': {
        const href = t.attrs?.find(a => a[0] === 'href')?.[1] ?? '';
        lastHref = href;
        ctx.out += gapSpan(ctx.pos, ctx.pos + 1);
        ctx.out += `<a href="${escAttr(href)}" data-link>`;
        ctx.pos += 1;
        break;
      }
      case 'link_close': {
        // The "](href)" part; link_close carries no attrs of its own.
        ctx.out += '</a>';
        ctx.out += gapSpan(ctx.pos, ctx.pos + 2 + lastHref.length + 1);
        ctx.pos += 2 + lastHref.length + 1;
        break;
      }
      case 'image': {
        ctx.hasRealContent = true;
        const rawSrc = t.attrs?.find(a => a[0] === 'src')?.[1] ?? '';
        // Relative srcs are read by the main process and handed back as a
        // data URL (Chromium in Electron refuses <img> loads of file://
        // sub-resources). data-abs lets the editor lazy-load + re-render.
        const isRemote = /^(https?:|data:)/i.test(rawSrc);
        const abs = ctx.baseDir ? `${ctx.baseDir}/${rawSrc}` : null;
        const src = isRemote
          ? rawSrc
          : (abs && ctx.resolveImg?.(abs)) || rawSrc;
        // "![" + alt + "]" + "(" + rawSrc + ")"
        const total = 2 + t.content.length + 1 + 1 + rawSrc.length + 1;
        ctx.out += `<span class="img-wrap" data-s="${ctx.pos}" data-e="${ctx.pos + total}">`;
        ctx.out += gapSpan(ctx.pos, ctx.pos + total);
        const absAttr = abs ? ` data-abs="${escAttr(abs)}"` : '';
        ctx.out += `<img src="${escAttr(src)}" alt="${escAttr(t.content)}" class="md-img"${absAttr}>`;
        ctx.out += '</span>';
        ctx.pos += total;
        break;
      }
      case 'html_inline': {
        ctx.hasRealContent = true;
        // Anchor the raw tag characters with a zero-width gap span so every
        // source offset (e.g. the "<u>" of an underline) stays clickable.
        ctx.out += gapSpan(ctx.pos, ctx.pos + t.content.length);
        ctx.out += t.content;
        ctx.pos += t.content.length;
        break;
      }
      case 'softbreak':
      case 'hardbreak': {
        const adv = t.type === 'hardbreak' ? 3 : 1;
        ctx.out += gapSpan(ctx.pos, ctx.pos + adv);
        ctx.out += '<br>';
        if (ctx.contOpen) {
          ctx.out += '</span>';
          ctx.contOpen = false;
        }
        // Continuation lines of a task item align with the item text:
        // indented past the checkbox that replaced the bullet.
        if (ctx.taskPrefix > 0) {
          ctx.out += '<span class="li-cont">';
          ctx.contOpen = true;
        }
        ctx.pos += adv;
        ctx.lineIdx += 1;
        inlineGap(ctx, ctx.starts[ctx.ls + ctx.lineIdx] + ctx.lineGap(ctx.lineIdx));
        break;
      }
    }
  }
  if (ctx.contOpen) ctx.out += '</span>';
  return ctx.out;
}

interface CellLayout {
  starts: number[];
  ends: number[];
}

// Positions (relative to the row start) of each cell's content start and its
// ending pipe (or the end of the row), so pipes and padding can be anchored.
function cellLayout(line: string): CellLayout {
  const starts: number[] = [];
  const ends: number[] = [];
  let i = line.startsWith('|') ? 1 : 0;
  for (;;) {
    let j = i;
    while (j < line.length && line[j] !== '|') j += line[j] === '\\' ? 2 : 1;
    const cell = line.slice(i, Math.min(j, line.length));
    let off = 0;
    while (off < cell.length && cell[off] === ' ') off += 1;
    starts.push(i + off);
    if (j >= line.length) {
      ends.push(line.length);
      break;
    }
    ends.push(j);
    i = j + 1;
  }
  return { starts, ends };
}

function renderFence(t: Token, starts: number[], content: string, bi: number): string {
  const [ls, le] = t.map!;
  const lineText = (i: number): string =>
    content.slice(starts[i], i + 1 < starts.length ? starts[i + 1] - 1 : content.length);
  const open = lineText(ls).match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  let s = starts[ls];
  if (open) {
    const rest = open[3];
    s =
      starts[ls] +
      open[1].length +
      open[2].length +
      (rest.startsWith(' ') ? 1 : 0) +
      (t.info ? t.info.length : 0);
  }
  const body = t.content;
  // The fence content starts AFTER the opening fence line's newline
  // (markdown-it's `content` begins at the first content character).
  const bodyStart = Math.min(s + 1, content.length);
  const bodyEnd = bodyStart + body.length;
  const blockEnd = le < starts.length ? starts[le] : content.length;
  const head = bodyStart > starts[ls] ? gapSpan(starts[ls], bodyStart, true) : '';
  const tail = gapSpan(bodyEnd, blockEnd);
  const lang = t.info || '';
  let code: string;
  let cls = '';
  if (lang && hljs.getLanguage(lang)) {
    code = hljs.highlight(body, { language: lang, ignoreIllegals: true }).value;
    cls = ` class="language-${lang}"`;
  } else {
    code = escapeHtml(body);
  }
  // An empty fence has no source text; render an nbsp anchor inside the
  // code so the block is clickable and the caret can be placed in it.
  const span =
    body === ''
      ? `<span data-s="${bodyStart}" data-e="${bodyStart}"><code>\u00a0</code></span>`
      : `<span data-s="${bodyStart}" data-e="${bodyEnd}"><code>${code}</code></span>`;
  // The fence markers (head/tail gaps) stay in the DOM for source mapping,
  // but are hidden: visible lines inside <pre> must be content only, so
  // clicks can never land on the marker lines and corrupt the fence.
  const hidden = (g: string): string => (g ? `<span class="src-only">${g}</span>` : '');
  if (lang === 'mermaid') {
    return `${hidden(head)}<pre class="mermaid" data-bi="${bi}">${span}</pre>${hidden(tail)}`;
  }
  // data-raw carries the un-highlighted source for the Copy button.
  const copyBtn = `<button type="button" class="code-copy" data-raw="${escapeHtml(body)}" title="Copy code">Copy</button>`;
  return `<div class="codeblock" data-bi="${bi}">${copyBtn}${hidden(head)}<pre${cls}>${span}</pre>${hidden(tail)}</div>`;
}

function blockEndFor(t: Token, starts: number[], content: string): number {
  const [, le] = t.map ?? [0, 1];
  return le < starts.length ? starts[le] : content.length;
}

export function renderMarkdown(
  content: string,
  baseDir?: string,
  resolveImg?: (abs: string) => string | null
): string {
  const tokens = md.parse(renderSource(content), {});
  const starts = lineStarts(content);
  let bi = 0;
  let html = '';
  let quotePrefix = 0;
  const quoteStack: number[] = [];
  let listPrefix = 0;
  const listStack: number[] = [];
  let inListItem = false;
  let covered = 0;
  let paraLs = 0;
  const nextBi = () => bi++;
  // Close tokens (paragraph_close, list_item_close, ...) carry no map of
  // their own; remember the map[1] of each open token so the closing
  // gap can be emitted inside the block that owns it.
  let headingEnd = 0;
  let paraEnd = 0;
  const quoteEnds: number[] = [];
  const liEnds: number[] = [];
  const listEnds: number[] = [];
  const liStarts: number[] = [];
  const taskPrefixes: number[] = [];
  // Per list item: whether any paragraph rendered real content, and the
  // position (end of the marker/checkbox prefix) of the first paragraph,
  // used to anchor an empty item with a visible clickable nbsp span.
  const itemHasContent: boolean[] = [];
  const itemAnchorPos: number[] = [];

  let paraHadRealContent = false;
  let tableEnd = 0;
  const lineEnd = (li: number) => (li < starts.length ? starts[li] : content.length);

  const lineText = (i: number): string =>
    content.slice(starts[i], i + 1 < starts.length ? starts[i + 1] - 1 : content.length);

  // Leading characters markdown-it stripped from the paragraph line `paraLs +
  // rel` (blockquote "> ", the list marker, or a continuation-line
  // indent). The parts are cumulative: a list inside a blockquote has both
  // the "> " and the marker on its first line.
  const lineGap = (rel: number): number => {
    const lt = lineText(paraLs + rel);
    let gap = 0;
    if (quotePrefix > 0) {
      const q = lt.match(/^>[\t ]?/);
      if (q) gap += q[0].length;
    }
    if (listPrefix > 0) {
      const rest = lt.slice(gap);
      if (rel === 0) {
        const m = rest.match(/^(\s*)([-*+]|\d+[.)])[\t ]+/);
        if (m) gap += m[0].length;
      } else {
        const m = rest.match(/^\s+/);
        if (m) gap += m[0].length;
      }
    }
    return gap;
  };

  // Blank source lines (a line consisting only of its newline) render as
  // visible empty lines — each gets its own block containing an &nbsp; so
  // every Enter produces a visible line, like Typora's editing view.
  const blankLines: Array<[number, number]> = [];
  for (let i = 0; i < starts.length; i++) {
    const ls = starts[i];
    const le = i + 1 < starts.length ? starts[i + 1] : content.length;
    if (le - ls === 1 && content[ls] === '\n') blankLines.push([ls, le]);
  }

  const emitCovered = (upTo: number): void => {
    if (upTo <= covered) return;
    let pos = covered;
    for (const [ls, le] of blankLines) {
      if (ls >= upTo) break;
      if (ls < pos) continue;
      if (pos < ls) {
        html += gapSpan(pos, ls);
        pos = ls;
      }
      html += `<div data-bi="${nextBi()}" data-blank-line><span data-s="${ls}" data-e="${le}">\u00a0</span></div>`;
      pos = le;
    }
    if (pos < upTo) {
      html += gapSpan(pos, upTo);
      pos = upTo;
    }
    covered = pos;
  };

  // Like emitCovered but returns the markup instead of appending it, so a
  // table cell can place its leading gap INSIDE the cell element. Blank
  // line divs cannot occur inside a table row, so a plain gap is enough.
  const cellGap = (upTo: number): string => {
    const out = upTo > covered ? gapSpan(covered, upTo) : '';
    covered = Math.max(covered, upTo);
    return out;
  };

  let rowStart = 0;
  let cellIdx = 0;
  let cellStarts: number[] = [];
  let inTableCell = false;
  let taskPrefix = 0;

  for (const t of tokens) {
    switch (t.type) {
      case 'heading_open': {
        const ls = t.map![0];
        headingEnd = t.map![1];
        emitCovered(starts[ls]);
        const inlinePos0 = starts[ls] + t.markup.length + 1;
        html += `<${t.tag} data-bi="${nextBi()}">${gapSpan(starts[ls], inlinePos0, true)}`;
        covered = inlinePos0;
        break;
      }
      case 'inline': {
        const children = t.children ?? [];
        // An empty table cell has no source text; render an nbsp anchor so
        // the cell is visible, clickable and the caret can be placed in it.
        if (inTableCell && children.length === 0) {
          html += `<span data-s="${covered}" data-e="${covered}">\u00a0</span>`;
        } else {
          const ctx: InlineCtx = { out: '', pos: covered, starts, ls: paraLs, lineIdx: 0, lineGap, taskPrefix, contOpen: false, hasRealContent: false, baseDir, resolveImg };
          html += renderInline(children, ctx);
          covered = ctx.pos;
          paraHadRealContent = ctx.hasRealContent;
        }
        break;
      }
      case 'heading_close': {
        emitCovered(lineEnd(headingEnd));
        html += `</${t.tag}>`;
        break;
      }
      case 'paragraph_close': {
        if (itemHasContent.length > 0 && paraHadRealContent) {
          itemHasContent[itemHasContent.length - 1] = true;
        }
        emitCovered(lineEnd(paraEnd));
        if (!inListItem) html += '</p>';
        break;
      }
      case 'blockquote_open': {
        const m = lineText(t.map![0]).match(/^>[\t ]?/);
        const add = m ? m[0].length : 0;
        quoteStack.push(add);
        quoteEnds.push(t.map![1]);
        quotePrefix += add;
        emitCovered(starts[t.map![0]]);
        html += `<blockquote data-bi="${nextBi()}">`;
        break;
      }
      case 'blockquote_close': {
        emitCovered(lineEnd(quoteEnds.pop() ?? 0));
        quotePrefix -= quoteStack.pop() ?? 0;
        html += '</blockquote>';
        break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        listEnds.push(t.map![1]);
        emitCovered(starts[t.map![0]]);
        html +=
          t.type === 'bullet_list_open' ? `<ul data-bi="${nextBi()}">` : `<ol data-bi="${nextBi()}">`;
        break;
      }
      case 'bullet_list_close':
      case 'ordered_list_close': {
        emitCovered(lineEnd(listEnds.pop() ?? 0));
        html += t.type === 'bullet_list_close' ? '</ul>' : '</ol>';
        break;
      }
      case 'list_item_open': {
        const lt = lineText(t.map![0]);
        const rest = quotePrefix > 0 ? lt.replace(/^>[\t ]?/, '') : lt;
        const m = rest.match(/^(\s*)([-*+]|\d+[.)])[\t ]+/);
        const add = m ? m[0].length : 0;
        listStack.push(add);
        liEnds.push(t.map![1]);
        listPrefix += add;
        inListItem = true;
        itemHasContent.push(false);
        itemAnchorPos.push(-1);
        emitCovered(starts[t.map![0]]);
        liStarts.push(covered);
        // GFM task list ("- [ ] item" / "- [x] item"): render a real
        // checkbox; the "[ ] " prefix is stripped from the text below and
        // the "x"/" " character stays addressable via data-ck. Task items
        // are rendered WITHOUT the list bullet (the checkbox replaces it).
        const restAfterMarker = rest.slice(m ? m[0].length : 0);
        const taskM = restAfterMarker.match(/^\[([ xX])\] /);
        taskPrefix = taskM ? 4 : 0;
        taskPrefixes.push(taskPrefix);
        html += taskM ? '<li class="task-item">' : '<li>';
        if (taskM) {
          const cbPos =
            starts[t.map![0]] +
            (lt.length - rest.length) +
            (m ? m[0].length : 0) +
            1;
          const checked = taskM[1] === 'x' || taskM[1] === 'X';
          html += `<label class="task"><input type="checkbox" data-ck="${cbPos}"${checked ? ' checked' : ''}></label>`;
        }
        break;
      }
      case 'list_item_close': {
        liEnds.pop();
        const ls = liStarts.pop() ?? 0;
        const tPrefix = taskPrefixes.pop() ?? 0;
        const hasContent = itemHasContent.pop() ?? true;
        let anchorPos = itemAnchorPos.pop() ?? -1;
        // markdown-it emits no paragraph tokens for a bare empty bullet
        // ("- "): compute the anchor from the item start in that case.
        if (anchorPos < 0) {
          anchorPos = ls + (listStack[listStack.length - 1] ?? 0) + tPrefix;
        }
        // An empty item (no text anywhere) gets a visible, clickable nbsp
        // anchor at the end of the marker/checkbox prefix so the caret can
        // be placed there and typed text becomes the item content.
        if (!hasContent && anchorPos >= 0) {
          if (covered < anchorPos) {
            // A bare empty bullet ("- ") has no paragraph tokens, so the
            // marker/checkbox prefix was never anchored: emit it as a
            // prefix gap so the caret snaps past the markup.
            html += gapSpan(covered, anchorPos, true);
            emitCovered(anchorPos);
          }
          html += `<span data-s="${anchorPos}" data-e="${anchorPos}">\u00a0\u00a0</span>`;
        }
        // Do NOT cover the item's trailing blank lines here: markdown-it
        // includes them in the item's map, but they belong BELOW the list
        // (rendered at the list level, left margin), not inside the last
        // <li> (which sits in the list-text column). The next list item or
        // the list close covers them.
        listPrefix -= listStack.pop() ?? 0;
        // taskPrefix must not leak past the list item: it would strip the
        // first characters of the next block (e.g. "Head" of "## Heading").
        taskPrefix = taskPrefixes[taskPrefixes.length - 1] ?? 0;
        inListItem = false;
        html += '</li>';
        break;
      }
      case 'fence': {
        html += renderFence(t, starts, content, nextBi());
        const [, le] = t.map!;
        covered = le < starts.length ? starts[le] : content.length;
        break;
      }
      case 'table_open': {
        tableEnd = t.map![1];
        emitCovered(starts[t.map![0]]);
        html += `<table data-bi="${nextBi()}">`;
        break;
      }
      case 'table_close': {
        html += '</table>';
        emitCovered(lineEnd(tableEnd));
        break;
      }
      case 'thead_open':
      case 'thead_close':
      case 'tbody_open':
      case 'tbody_close':
        break;
      case 'tr_open': {
        rowStart = starts[t.map![0]];
        const layout = cellLayout(lineText(t.map![0]));
        // In an empty cell start === end and both point at the closing
        // pipe; anchor those cells at the cell start instead so typed
        // text lands at the beginning of the cell.
        const adj = layout.starts.map((x, k) =>
          x === layout.ends[k] ? (k === 0 ? 1 : layout.ends[k - 1] + 1) : x
        );
        cellStarts = adj.map(x => rowStart + x);
        cellIdx = 0;
        html += '<tr>';
        break;
      }
      case 'tr_close': {
        html += '</tr>';
        break;
      }
      case 'th_open':
      case 'td_open': {
        inTableCell = true;
        // The cell's leading gap (row start, pipes, separator row, previous
        // cell remainder) must live INSIDE the cell: inline spans that are
        // direct children of <table>/<tr> are invalid HTML and Chromium
        // reparses them outside the table, stealing caret clicks.
        html +=
          (t.type === 'th_open' ? '<th>' : '<td>') +
          cellGap(cellStarts[cellIdx] ?? rowStart);
        cellIdx += 1;
        break;
      }
      case 'th_close':
      case 'td_close': {
        inTableCell = false;
        html += t.type === 'th_close' ? '</th>' : '</td>';
        break;
      }
      case 'paragraph_open': {
        const ls = t.map![0];
        paraLs = ls;
        paraEnd = t.map![1];
        emitCovered(starts[ls]);
        const inlinePos0 = starts[ls] + lineGap(0);

        if (
          itemHasContent.length > 0 &&
          !itemHasContent[itemHasContent.length - 1] &&
          itemAnchorPos[itemAnchorPos.length - 1] < 0
        ) {
          // Anchor position: past the marker AND the checkbox prefix, so
          // typing there becomes the item text (not checkbox markup).
          itemAnchorPos[itemAnchorPos.length - 1] =
            Math.max(covered, inlinePos0) + (taskPrefix > 0 ? taskPrefix : 0);
        }
        if (!inListItem && (quotePrefix > 0 || listPrefix > 0)) {
          // Inside a quote/list: emit the leading gap INSIDE the <p>. A
          // leaked inline gap before the <p> renders as a phantom empty
          // line (the line box strut keeps the inherited line-height), and
          // the <p> would no longer be the container's first child. No
          // blank source line can sit in this range (a bare newline line
          // would have ended the quote/list), so a plain gap is safe.
          html += `<p data-bi="${nextBi()}">`;
          if (inlinePos0 > covered) {
            html += gapSpan(covered, inlinePos0, true);
            covered = inlinePos0;
          }
        } else {
          emitCovered(starts[ls]);
          if (inlinePos0 > covered) {
            html += gapSpan(covered, inlinePos0, true);
            covered = inlinePos0;
          }
          if (!inListItem) html += `<p data-bi="${nextBi()}">`;
        }
        break;
      }
      case 'html_block': {
        const ls = t.map![0];
        emitCovered(starts[ls]);
        html += t.content;
        emitCovered(blockEndFor(t, starts, content));
        break;
      }
    }
  }
  // A trailing newline produces no block from markdown-it; render an empty
  // paragraph with a zero-width anchor run so the line is visible and the
  // cursor can be restored on it.
  if (content.endsWith('\n')) {
    const len = content.length;
    emitCovered(len);
    html += `<p data-bi="${nextBi()}"><span data-s="${len}" data-e="${len}">\u00a0</span></p>`;
  }
  return html;
}

export interface Heading {
  level: number;
  text: string;
  pos: number;
}

export function extractHeadings(content: string): Heading[] {
  const tokens = md.parse(renderSource(content), {});
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
