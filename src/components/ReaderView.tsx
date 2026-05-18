import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertCircle, Check, X, Crop } from 'lucide-react';
import { Document, Page } from 'react-pdf';
import { EpubView } from './EpubView';
import { SadMonkIcon } from './SadMonkIcon';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ReaderViewProps {
  fileUrl: string;
  fileType: string;
  textContent: string[] | null;
  numPages: number;
  pageNumber: number;
  zoom: number;
  theme: string;
  scrollRatio: number;
  isRestoring: boolean;
  pageRatios: number[];
  isFocusMode?: boolean;
  isCaptureMode?: boolean;
  onCapture?: (base64: string) => void;
  onLoadSuccess: (pdf: any) => void;
  onLoadError?: (error: Error) => void;
  onPageRenderSuccess: (p: number) => void;
  onPageRenderError?: (p: number, error: Error) => void;
  onTextSelection?: (text: string, x: number, y: number) => void;
  onEpubLocationChange?: (cfi: string) => void;
  epubCfi?: string;
  themeStyles: Record<string, string>;
  pdfFilter: Record<string, string>;
  isSimplified: boolean;
  isReaderMode?: boolean;
  onToggleReaderMode?: () => void;
}

interface PageItemProps {
  pageNum: number;
  zoom: number;
  isVisible: boolean;
  calculatedHeight: number;
  minWidth: number;
  isFocusMode?: boolean;
  isCaptureMode?: boolean;
  onCapture?: (base64: string) => void;
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
  isCaptureMode,
  onCapture,
  onRenderSuccess,
  onRenderError,
}) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'rendered' | 'error'>('idle');
  const [selection, setSelection] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isCaptureMode) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelection({ x1: x, y1: y, x2: x, y2: y });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isCaptureMode || !isDragging || !selection) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSelection({ ...selection, x2: e.clientX - rect.left, y2: e.clientY - rect.top });
  };

  const handleMouseUp = () => {
    if (!isCaptureMode) return;
    setIsDragging(false);
  };

  const confirmCapture = async () => {
    if (!selection || !onCapture) return;
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;

    const x = Math.min(selection.x1, selection.x2);
    const y = Math.min(selection.y1, selection.y2);
    const width = Math.abs(selection.x2 - selection.x1);
    const height = Math.abs(selection.y2 - selection.y1);

    if (width < 10 || height < 10) return;

    const scale = canvas.width / canvas.clientWidth;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = width * scale;
    captureCanvas.height = height * scale;
    const ctx = captureCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      canvas,
      x * scale, y * scale, width * scale, height * scale,
      0, 0, width * scale, height * scale
    );

    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.9);
    setSelection(null);
    onCapture(dataUrl);
  };

  return (
    <div
      id={`page-${pageNum}`}
      ref={containerRef}
      data-page={pageNum}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={cn(
        "page-wrapper relative bg-white shadow-lg mb-8 mx-auto transition-all duration-500 overflow-hidden",
        isFocusMode && "ring-2 ring-indigo-500/20",
        isCaptureMode && "cursor-crosshair"
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
          className="transition-transform duration-500 ease-in-out relative"
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
          
          {/* Capture Mode Block Layer */}
          {isCaptureMode && (
            <div className="absolute inset-0 z-20 cursor-crosshair" />
          )}

          {/* Selection Overlay */}
          {isCaptureMode && selection && (
            <div 
              className="absolute border-2 border-amber-500 bg-amber-500/10 z-50 flex items-start justify-end"
              style={{
                left: Math.min(selection.x1, selection.x2),
                top: Math.min(selection.y1, selection.y2),
                width: Math.abs(selection.x2 - selection.x1),
                height: Math.abs(selection.y2 - selection.y1)
              }}
            >
              {!isDragging && (
                <div className="flex gap-1 p-1 bg-amber-500 rounded-bl-lg shadow-lg">
                  <button onClick={confirmCapture} className="text-white hover:bg-white/20 p-0.5 rounded transition-colors"><Check size={16} /></button>
                  <button onClick={() => setSelection(null)} className="text-white hover:bg-white/20 p-0.5 rounded transition-colors"><X size={16} /></button>
                </div>
              )}
            </div>
          )}
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
  scrollRatio,
  isRestoring,
  pageRatios,
  isFocusMode,
  isCaptureMode,
  onCapture,
  onLoadSuccess,
  onLoadError,
  onPageRenderSuccess,
  onPageRenderError,
  onTextSelection,
  onEpubLocationChange,
  epubCfi,
  themeStyles,
  pdfFilter,
  isSimplified,
  isReaderMode,
  onToggleReaderMode,
}) => {
  const [docError, setDocError] = useState<string | null>(null);

  const handleLoadSuccess = useCallback(
    (pdf: any) => {
      setDocError(null);
      onLoadSuccess(pdf);
    },
    [onLoadSuccess]
  );

  const handleLoadError = useCallback(
    (err: Error) => {
      setDocError(err.message);
      onLoadError?.(err);
    },
    [onLoadError]
  );

  const handleMouseUp = useCallback(() => {
    if (fileType !== 'pdf' && fileType !== 'txt') return;
    if (isCaptureMode) return;
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && onTextSelection) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      onTextSelection(selection.toString().trim(), rect.left + rect.width / 2, rect.top);
    }
  }, [onTextSelection, fileType, isCaptureMode]);

  return (
    <div
      className={cn(
        'min-h-full flex flex-col items-center justify-start p-0 sm:p-8 transition-colors duration-500',
        isSimplified && 'bg-stone-900 transition-none',
        themeStyles[theme]
      )}
      onMouseUp={handleMouseUp}
    >
      <AnimatePresence>
        {isCaptureMode && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-amber-600 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-3 border border-amber-400"
          >
            <Crop size={20} />
            <span>Modo Captura: Arrastra para seleccionar una portada</span>
          </motion.div>
        )}
      </AnimatePresence>

      {isReaderMode || fileType === 'txt' ? (
        <div
          className={cn(
            'max-w-2xl w-full p-6 sm:p-12 font-serif leading-relaxed shadow-xl rounded-2xl min-h-[80vh] selection:bg-amber-200 selection:text-amber-900 transition-all duration-300 flex flex-col gap-2',
            themeStyles[theme]
          )}
          style={{ fontSize: `${(typeof zoom === 'number' ? zoom : 1) * 1.25}rem` }}
        >
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

              return (
                <div
                  key={`text-page-item-${pNum}`}
                  id={`text-page-${pNum}`}
                  data-page={pNum}
                  className="text-page-wrapper py-6 border-b border-stone-200/20 dark:border-stone-800/20 last:border-b-0 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between border-b border-stone-200/30 dark:border-stone-800/30 pb-2 mb-4 font-mono text-[9px] text-stone-400 dark:text-stone-500 select-none">
                    <span className="tracking-widest uppercase font-bold text-amber-600/70 dark:text-amber-500/60">PÁGINA {pNum}</span>
                    {fileType === 'pdf' && onToggleReaderMode && (
                      <button
                        onClick={onToggleReaderMode}
                        className="hover:text-amber-500 transition-colors uppercase tracking-wider flex items-center gap-1 cursor-pointer font-bold"
                      >
                        Ver original PDF ↗
                      </button>
                    )}
                  </div>

                  {pageHtml ? (
                    <div 
                      className="semantic-page-content leading-relaxed text-justify space-y-4"
                      dangerouslySetInnerHTML={{ __html: pageHtml }}
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
              <p className="font-mono text-xs uppercase tracking-widest">Extracting text for reader mode...</p>
            </div>
          )}
        </div>
      ) : fileType === 'pdf' ? (
        <div
          className="relative shadow-2xl flex flex-col gap-0 py-0"
          style={{ filter: pdfFilter[theme] }}
        >
          <Document
            file={fileUrl}
            onLoadSuccess={handleLoadSuccess}
            onLoadError={handleLoadError}
            loading={null}
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
                    isCaptureMode={isCaptureMode}
                    onCapture={onCapture}
                    onRenderSuccess={onPageRenderSuccess}
                    onRenderError={onPageRenderError}
                  />
                );
              })
            )}
          </Document>
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
