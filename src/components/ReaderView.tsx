import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import { Loader2, AlertCircle } from 'lucide-react';
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
  onLoadSuccess: (pdf: any) => void;
  onPageRenderSuccess: (p: number) => void;
  onPageRenderError?: (p: number, error: Error) => void;
  onTextSelection?: (text: string, x: number, y: number) => void;
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
      className="page-wrapper relative bg-white shadow-lg mb-8 mx-auto transition-all duration-300"
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
        <>
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
        </>
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
  onLoadSuccess,
  onPageRenderSuccess,
  onPageRenderError,
  onTextSelection,
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
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && onTextSelection) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      onTextSelection(selection.toString().trim(), rect.left + rect.width / 2, rect.top);
    }
  }, [onTextSelection]);

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
      ) : (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle size={48} className="text-amber-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Formato no soportado</h2>
          <p className="text-stone-500">
            Actualmente solo soportamos PDF y TXT. Estamos trabajando en EPUB y
            DOCS.
          </p>
        </div>
      )}
    </div>
  );
};
