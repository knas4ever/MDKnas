import { renderMarkdown } from '../lib/markdown';

export interface AboutInfo {
  name: string;
  version: string;
  changelog: string;
}

interface Props {
  about: AboutInfo;
  onClose(): void;
}

export default function AboutDialog({ about, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="dialog"
      aria-label={`About ${about.name}`}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="flex max-h-[85vh] flex-col gap-3 rounded border border-[var(--border)] bg-[var(--bg)] p-4 shadow-lg"
        style={{ width: 'min(560px, 90vw)' }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="m-0 text-lg">{about.name}</h2>
          <span className="text-sm opacity-70">version {about.version}</span>
        </div>
        <div
          className="wysiwyg-root max-h-[60vh] overflow-auto"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(about.changelog) }}
        />
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
