// Converts a rich-text HTML clipboard fragment back into markdown so that
// copy -> paste inside the app preserves formatting (bold, italic, links,
// underline, highlight, code, ...).

function nodeToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  const el = node as Element;
  let inner = '';
  for (const child of Array.from(el.childNodes)) inner += nodeToMd(child);
  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      return inner ? `**${inner}**` : inner;
    case 'EM':
    case 'I':
      return inner ? `*${inner}*` : inner;
    case 'S':
    case 'STRIKE':
      return inner ? `~~${inner}~~` : inner;
    case 'U':
      return inner ? `<u>${inner}</u>` : inner;
    case 'MARK':
      return inner ? `<mark>${inner}</mark>` : inner;
    case 'CODE':
      return inner ? `\`${inner}\`` : inner;
    case 'A': {
      const href = el.getAttribute('href') ?? '';
      return inner && href ? `[${inner}](${href})` : inner;
    }
    case 'BR':
      return '\n';
    case 'P':
      return inner ? `${inner}\n` : inner;
    default:
      return inner;
  }
}

export function htmlFragmentToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return nodeToMd(doc.body);
}
