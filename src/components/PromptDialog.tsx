import { useEffect, useRef, useState } from 'react';

interface Props {
  message: string;
  defaultValue: string;
  onSubmit(value: string): void;
  onCancel(): void;
}

export default function PromptDialog({ message, defaultValue, onSubmit, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="dialog"
      aria-label={message}
    >
      <div
        className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--bg)] p-4 shadow-lg"
        style={{ width: 'min(440px, 90vw)' }}
      >
        <div className="text-sm">{message}</div>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit(value);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-[var(--border)] px-3 py-1 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(value)}
            className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
