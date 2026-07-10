import { useState, useEffect, useRef } from 'react';
import { parsePageInput } from '../utils/reader';

export function PageInput({
  pageNumber,
  numPages,
  onGoToPage,
}: {
  pageNumber: number;
  numPages: number;
  onGoToPage: (p: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(pageNumber));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(String(pageNumber));
  }, [pageNumber]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const p = parsePageInput(value, numPages);
    if (p !== null) onGoToPage(p);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        aria-label="Go to page"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-10 bg-transparent text-center text-[10px] font-mono text-stone-300 outline-none border-b border-white/20 focus:border-amber-500"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-[10px] font-mono tabular-nums min-w-[48px] text-center hover:text-white transition-colors"
    >
      {pageNumber} / {numPages}
    </button>
  );
}
