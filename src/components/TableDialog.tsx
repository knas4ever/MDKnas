import { useEffect, useRef, useState } from 'react';

export interface TableSize {
  rows: number;
  cols: number;
}

interface Props {
  onSubmit(size: TableSize): void;
  onCancel(): void;
}

const clamp = (n: number): number => Math.max(1, Math.min(20, Math.round(n) || 1));

export default function TableDialog({ onSubmit, onCancel }: Props) {
  const rowsRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  useEffect(() => {
    rowsRef.current?.focus();
    rowsRef.current?.select();
  }, []);

  const submit = (): void => {
    onSubmit({ rows: clamp(rows), cols: clamp(cols) });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="dialog"
      aria-label="Insert table"
    >
      <div
        className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--bg)] p-4 shadow-lg"
        style={{ width: 'min(380px, 90vw)' }}
      >
        <div className="text-sm">Insert table</div>
        <label className="flex items-center gap-2 text-sm">
          Rows
          <input
            ref={rowsRef}
            type="number"
            min={1}
            max={20}
            value={rows}
            onChange={e => setRows(Number(e.target.value))}
            className="w-16 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Columns
          <input
            type="number"
            min={1}
            max={20}
            value={cols}
            onChange={e => setCols(Number(e.target.value))}
            className="w-16 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-[var(--border)] px-3 py-1 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-white"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
