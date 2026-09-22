import type { EditorAction } from '../lib/editorActions';

interface Props {
  onAction(a: EditorAction): void;
  theme: string;
  themes: string[];
  onThemeChange(theme: string): void;
  typewriter: boolean;
  onToggleTypewriter(): void;
  sourceMode: boolean;
  onToggleSourceMode(): void;
}

const ACTIONS: Array<{ label: string; title: string; action: EditorAction }> = [
  { label: 'B', title: 'Bold (Ctrl+B)', action: 'bold' },
  { label: 'I', title: 'Italic (Ctrl+I)', action: 'italic' },
  { label: 'H1', title: 'Heading 1 (Ctrl+Shift+1)', action: 'h1' },
  { label: 'H2', title: 'Heading 2 (Ctrl+Shift+2)', action: 'h2' },
  { label: 'H3', title: 'Heading 3 (Ctrl+Shift+3)', action: 'h3' },
  { label: '•', title: 'Bullet list (Ctrl+Shift+L)', action: 'ul' },
  { label: '☐', title: 'Task list (Ctrl+Shift+T)', action: 'tasklist' },
  { label: '1.', title: 'Numbered list (Ctrl+Shift+7)', action: 'ol' },
  { label: '❝', title: 'Blockquote (Ctrl+Shift+Q)', action: 'quote' },
  { label: '</>', title: 'Inline code (Ctrl+`)', action: 'code' },
  { label: 'S̶', title: 'Strikethrough (Ctrl+Shift+X)', action: 'strikethrough' },
  { label: 'U̲', title: 'Underline (Ctrl+U)', action: 'underline' },
  { label: 'H', title: 'Highlight (Ctrl+Shift+H)', action: 'highlight' },
  { label: 'Link', title: 'Link (Ctrl+K)', action: 'link' },
  { label: '```', title: 'Code block', action: 'codeblock' },
  { label: 'Table', title: 'Insert table…', action: 'table' }
];

export default function Toolbar({
  onAction,
  theme,
  themes,
  onThemeChange,
  typewriter,
  onToggleTypewriter,
  sourceMode,
  onToggleSourceMode
}: Props) {
  return (
    <div className="toolbar" role="toolbar">
      {ACTIONS.map(a => (
        <button key={a.action} title={a.title} onClick={() => onAction(a.action)}>
          {a.label}
        </button>
      ))}
      <span className="flex-1" />
      <label className="text-xs opacity-70" htmlFor="theme-select">
        Theme
      </label>
      <select
        id="theme-select"
        value={theme}
        onChange={e => onThemeChange(e.target.value)}
        className="rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 text-sm"
      >
        {themes.map(t => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        title="Toggle typewriter mode"
        onClick={onToggleTypewriter}
        className={typewriter ? 'bg-[var(--accent)] text-white' : ''}
      >
        Typewriter
      </button>
      <button
        title="Toggle raw markdown / rich text view"
        onClick={onToggleSourceMode}
        className={sourceMode ? 'bg-[var(--accent)] text-white' : ''}
      >
        {sourceMode ? 'Rich' : 'Raw MD'}
      </button>
    </div>
  );
}
