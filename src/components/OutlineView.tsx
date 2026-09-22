import { extractHeadings } from '../lib/markdown';

interface Props {
  content: string;
  onJump(pos: number): void;
}

export default function OutlineView({ content, onJump }: Props) {
  const headings = extractHeadings(content);
  if (headings.length === 0) {
    return <div className="p-3 text-sm opacity-60">No headings.</div>;
  }
  return (
    <div className="flex-1 overflow-auto p-2 text-sm">
      {headings.map((h, i) => (
        <button
          key={i}
          style={{ paddingLeft: (h.level - 1) * 12 + 12 }}
          onClick={() => onJump(h.pos)}
          className="block w-full text-left"
        >
          {h.text || '(empty)'}
        </button>
      ))}
    </div>
  );
}
