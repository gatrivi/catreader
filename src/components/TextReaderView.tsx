import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PaperLayer } from './PaperLayer';
import { usePaperTexture } from '../hooks/usePaperTexture';
import { applyInkVariance } from '../utils/paperSoul';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TextReaderViewProps {
  fileType: string;
  textContent: string[] | null;
  pageNumber: number;
  zoom: number;
  theme: string;
  isSimplified: boolean;
  onTextSelection?: (text: string, x: number, y: number) => void;
  onToggleReaderMode?: () => void;
  themeStyles: Record<string, string>;
  paperPath?: string | null;
}

export default function TextReaderView({
  fileType,
  textContent,
  pageNumber,
  zoom,
  theme,
  isSimplified,
  onTextSelection,
  onToggleReaderMode,
  themeStyles,
  paperPath,
}: TextReaderViewProps) {
  const paperOn = theme === 'paper';
  const { active, grainUrl } = usePaperTexture(paperPath, pageNumber, paperOn);

  useEffect(() => {
    if (!onTextSelection) return;

    const handleSelectionEnd = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const text = selection.toString().trim();
      if (text.length < 2) return;

      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!range) return;
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      onTextSelection(text, rect.left + rect.width / 2, rect.top);
    };

    document.addEventListener('mouseup', handleSelectionEnd);
    return () => document.removeEventListener('mouseup', handleSelectionEnd);
  }, [onTextSelection]);

  return (
    <div
      className={cn(
        'min-h-full flex flex-col items-center justify-start p-0 sm:p-8 transition-colors duration-500',
        isSimplified && 'bg-stone-900 transition-none',
        themeStyles[theme],
      )}
    >
      <div
        className={cn(
          'relative max-w-2xl w-full p-6 sm:p-12 font-serif leading-relaxed shadow-xl rounded-2xl min-h-[80vh] selection:bg-amber-200 selection:text-amber-900 transition-all duration-300 flex flex-col gap-2',
          themeStyles[theme],
        )}
        style={{ fontSize: `${zoom * 1.25}rem` }}
      >
        {paperOn && <PaperLayer active={active} grainUrl={grainUrl} />}
        {textContent ? (
          textContent.map((pageHtml, idx) => {
            const pNum = idx + 1;
            const isVisible = Math.abs(pNum - pageNumber) <= 6;

            if (!isVisible) {
              return (
                <div
                  key={`text-page-item-${pNum}`}
                  id={`text-page-${pNum}`}
                  data-page={pNum}
                  className="text-page-wrapper text-page-placeholder py-12 border-b border-stone-200/20 dark:border-stone-800/20 flex items-center justify-center"
                  style={{ minHeight: '300px' }}
                >
                  <div className="text-stone-300 dark:text-stone-700 font-mono text-[10px] tracking-widest uppercase">
                    Página {pNum} (Virtualizada)
                  </div>
                </div>
              );
            }

            const html = paperOn && pageHtml ? applyInkVariance(pageHtml) : pageHtml;

            return (
              <div
                key={`text-page-item-${pNum}`}
                id={`text-page-${pNum}`}
                data-page={pNum}
                className="relative z-[1] text-page-wrapper py-6 border-b border-stone-200/20 dark:border-stone-800/20 last:border-b-0 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between border-b border-stone-200/30 dark:border-stone-800/30 pb-2 mb-4 font-mono text-[9px] text-stone-400 dark:text-stone-500 select-none">
                  <span className="tracking-widest uppercase font-bold text-amber-600/70 dark:text-amber-500/60">PÁGINA {pNum}</span>
                  {fileType === 'pdf' && onToggleReaderMode && (
                    <button
                      type="button"
                      onClick={onToggleReaderMode}
                      className="hover:text-amber-500 transition-colors uppercase tracking-wider flex items-center gap-1 cursor-pointer font-bold"
                    >
                      Ver original PDF ↗
                    </button>
                  )}
                </div>

                {html ? (
                  <div
                    className={cn(
                      'semantic-page-content leading-relaxed text-justify space-y-4',
                      paperOn && 'paper-soul-ink',
                    )}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ) : (
                  <div className="flex items-center justify-center py-10 text-stone-400 dark:text-stone-600 gap-2">
                    <Loader2 className="animate-spin" size={16} />
                    <span className="font-mono text-[10px] tracking-wider uppercase">Procesando página {pNum}...</span>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-stone-400 gap-4">
            <Loader2 className="animate-spin" size={32} />
            <p className="font-mono text-xs uppercase tracking-widest">Preparando texto…</p>
          </div>
        )}
      </div>
    </div>
  );
}
