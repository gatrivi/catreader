import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import { Loader2, AlertCircle } from 'lucide-react';
import { EpubView } from './EpubView';
import { SadMonkIcon } from './SadMonkIcon';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ReaderViewProps {
  fileUrl: string;
  fileType: string;
  textContent: string | null;
  numPages: number;
  pageNumber: number;
  zoom: number;
  theme: string;
  scrollRatio: number;
  isRestoring: boolean;
  pageRatios: number[];
  isFocusMode?: boolean;
  onLoadSuccess: (pdf: any) => void;
  onPageRenderSuccess: (p: number) => void;
  onPageRenderError?: (p: number, error: Error) => void;
  onTextSelection?: (text: string, x: number, y: number) => void;
  onEpubLocationChange?: (cfi: string) => void;
  epubCfi?: string;
  themeStyles: Record<string, string>;
  pdfFilter: Record<string, string>;
  isSimplified: boolean;
}

interface PageItemProps {
  pageNum: number;
  zoom: number;
  isVisible: boolean;
  calculatedHeight: number;
  minWidth: number;
  isFocusMode?: boolean;
  onRenderSuccess: (p: number) => void;
  onRenderError?: (p: number, error: Error) => void;
}

const RENDER_TIMEOUT_MS = 15000;

const PageItem: React.FC<PageItemProps> = ({
  pageNum,
  zoom,
  isVisible,
  calculatedHeight,
  minWidth,
  isFocusMode,
  onRenderSuccess,
  onRenderError,
}) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'rendered' | 'error'>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isVisible) {
      setStatus('idle');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    setStatus('loading');
    timeoutRef.current = setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'error' : s));
    }, RENDER_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isVisible, pageNum]);

  const handleSuccess = useCallback(() => {
    setStatus('rendered');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    onRenderSuccess(pageNum);
  }, [pageNum, onRenderSuccess]);

  const handleError = useCallback((err: Error) => {
    setStatus('error');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    onRenderError?.(pageNum, err);
  }, [pageNum, onRenderError]);

  return (
    <div
      id={`page-${pageNum}`}
      data-page={pageNum}
      className={cn(
        "page-wrapper relative bg-white shadow-lg mb-8 mx-auto transition-all duration-500 overflow-hidden",
        isFocusMode && "ring-2 ring-indigo-500/20"
      )}
      style={{
        width: 'fit-content',
        minWidth,
        minHeight: calculatedHeight,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {isVisible && (
        <div 
          className="transition-transform duration-500 ease-in-out"
          style={{ 
            transform: isFocusMode ? 'scale(1.15)' : 'scale(1)',
            transformOrigin: 'center center'
          }}
        >
          {status !== 'rendered' && status !== 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-50 z-10">
              <Loader2 className="animate-spin text-stone-400 mb-2" size={24} />
              <span className="text-[11px] font-mono text-stone-400">
                Loading page {pageNum}...
              </span>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-100 z-10">
              <AlertCircle className="text-amber-500 mb-2" size={28} />
              <span className="text-[11px] font-mono text-stone-500 mb-1">
                Could not render page {pageNum}
              </span>
              <span className="text-[10px] text-stone-400">
                The page may be blank or failed to load
              </span>
            </div>
          )}
          <Page
            pageNumber={pageNum}
            scale={zoom}
            width={800}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            loading={null}
            onRenderSuccess={handleSuccess}
            onRenderError={handleError}
          />
        </div>
      )}

      {!isVisible && (
        <div className="flex items-center justify-center text-stone-300 text-xs font-mono">
          {pageNum}
        </div>
      )}

      {/* Trust watermark: always visible so user knows which page this is */}
      <div className="absolute bottom-1 right-2 text-[9px] font-mono text-stone-300 select-none pointer-events-none z-20 opacity-50">
        {pageNum}
      </div>
    </div>
  );
};

export const ReaderView: React.FC<ReaderViewProps> = ({
  fileUrl,
  fileType,
  textContent,
  numPages,
  pageNumber,
  zoom,
  theme,
  pageRatios,
  isFocusMode,
  onLoadSuccess,
  onPageRenderSuccess,
  onPageRenderError,
  onTextSelection,
  onEpubLocationChange,
  epubCfi,
  themeStyles,
  pdfFilter,
  isSimplified,
}) => {
  const [docError, setDocError] = useState<string | null>(null);

  const handleLoadSuccess = useCallback(
    (pdf: any) => {
      setDocError(null);
      onLoadSuccess(pdf);
    },
    [onLoadSuccess]
  );

  const handleMouseUp = useCallback(() => {
    if (fileType !== 'pdf' && fileType !== 'txt') return;
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && onTextSelection) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      onTextSelection(selection.toString().trim(), rect.left + rect.width / 2, rect.top);
    }
  }, [onTextSelection, fileType]);

  return (
    <div
      className={cn(
        'min-h-full flex flex-col items-center justify-start p-0 sm:p-8',
        isSimplified && 'bg-stone-900 transition-none'
      )}
      onMouseUp={handleMouseUp}
    >
      {fileType === 'pdf' ? (
        <div
          className="relative shadow-2xl flex flex-col gap-0 py-0"
          style={{ filter: pdfFilter[theme] }}
        >
          <Document
            file={fileUrl}
            onLoadSuccess={handleLoadSuccess}
            onLoadError={(err: Error) => setDocError(err.message)}
            loading={
              <div className="h-screen flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-500" size={48} />
              </div>
            }
          >
            {docError ? (
              <div className="h-screen flex flex-col items-center justify-center text-center p-8">
                <AlertCircle size={48} className="text-red-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">Failed to load PDF</h2>
                <p className="text-stone-500">{docError}</p>
              </div>
            ) : (
              Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
                const isVisible = Math.abs(p - pageNumber) <= 8;
                const ratio = pageRatios[p - 1] || 595 / 842;
                const calculatedHeight = (zoom * 800) / ratio;
                const minWidth = Math.min(
                  window.innerWidth * 0.9,
                  zoom * 800
                );

                return (
                  <PageItem
                    key={`page-item-${p}`}
                    pageNum={p}
                    zoom={zoom}
                    isVisible={isVisible}
                    calculatedHeight={calculatedHeight}
                    minWidth={minWidth}
                    isFocusMode={isFocusMode}
                    onRenderSuccess={onPageRenderSuccess}
                    onRenderError={onPageRenderError}
                  />
                );
              })
            )}
          </Document>
        </div>
      ) : fileType === 'txt' ? (
        <div
          className={cn(
            'max-w-3xl w-full p-8 font-mono whitespace-pre-wrap leading-relaxed shadow-sm rounded-lg',
            themeStyles[theme]
          )}
        >
          {textContent}
        </div>
      ) : fileType === 'epub' ? (
        <div className="w-full h-[calc(100vh-120px)] flex flex-col">
          <EpubView 
            fileUrl={fileUrl} 
            theme={theme} 
            initialLocation={epubCfi} 
            onLocationChange={onEpubLocationChange} 
          />
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-stone-900/40 backdrop-blur-md rounded-3xl border border-white/5 shadow-2xl py-20">
          <SadMonkIcon size={120} className="text-amber-500 mb-8" />
          <h2 className="text-2xl font-serif font-bold text-white mb-2 tracking-tight">Formato no soportado</h2>
          <p className="text-stone-400 max-w-sm">
            Este monje está triste porque todavía no sabemos cómo leer archivos <span className="text-amber-500 font-mono font-bold uppercase">{fileType}</span>.
          </p>
          <p className="text-stone-500 text-xs mt-4 italic">
            Estamos meditando para añadir soporte pronto.
          </p>
        </div>
      )}
    </div>
  );
};
