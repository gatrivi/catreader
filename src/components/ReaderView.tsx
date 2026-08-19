import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertCircle, Check, X, Crop, Share2 } from 'lucide-react';
import { Document, Page, pdfjs as pdfjsLib } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { EpubView } from './EpubView';
import { SadMonkIcon } from './SadMonkIcon';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { isPageInRenderWindow } from '../utils/reader';
import { PaperLayer } from './PaperLayer';
import { usePaperTexture } from '../hooks/usePaperTexture';
import { applyInkVariance, stainsForPage } from '../utils/paperSoul';
import { QuoteShareSheet, buildQuoteShareText, inferCurrentBookTitle } from './QuoteShareSheet';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
  /** books.json paper manifest URL */
  paperPath?: string | null;
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

interface ShareSelection {
  text: string;
  x: number;
  y: number;
  page: number;
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

    // Account for canvas being centered inside containerRef when zoomed
    const containerRect = containerRef.current?.getBoundingClientRect();
    const canvasRect = (canvas as HTMLCanvasElement).getBoundingClientRect();
    const offsetX = containerRect ? canvasRect.left - containerRect.left : 0;
    const offsetY = containerRect ? canvasRect.top - containerRect.top : 0;

    const scale = canvas.width / canvas.clientWidth;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = width * scale;
    captureCanvas.height = height * scale;
    const ctx = captureCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      canvas,
      (x - offsetX) * scale, (y - offsetY) * scale, width * scale, height * scale,
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
          
          {/* Capture Mode: crosshair cursor only; selection rect handles interaction */}
          {isCaptureMode && (
            <div className="absolute inset-0 z-20 cursor-crosshair pointer-events-none" />
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
                <div className="flex gap-1 p-1 bg-amber-500 rounded-bl-lg shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
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
  paperPath,
}) => {
  const [docError, setDocError] = useState<string | null>(null);
  const [shareSelection, setShareSelection] = useState<ShareSelection | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const paperOn = theme === 'paper';
  // Grain+stains on all paths when paper theme; ink only on DOM text.
  const { manifest, active, grainUrl } = usePaperTexture(paperPath, pageNumber, paperOn);

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

  useEffect(() => {
    if (isCaptureMode) return;

    const handleSelectionEnd = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const text = selection.toString().trim();
      if (text.length < 2) return;

      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!range) return;
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      const startNode = range.startContainer;
      const startElement = startNode.nodeType === Node.ELEMENT_NODE
        ? startNode as Element
        : startNode.parentElement;
      const pageElement = startElement?.closest<HTMLElement>('[data-page]');
      const selectedPageRaw = pageElement?.dataset.page;
      const selectedPage = selectedPageRaw ? parseInt(selectedPageRaw, 10) : pageNumber;
      const x = rect.left + rect.width / 2;
      const y = rect.top;

      setShareOpen(false);
      setShareSelection({ text, x, y, page: Number.isFinite(selectedPage) ? selectedPage : pageNumber });
      onTextSelection?.(text, x, y);
    };

    const handleTouchEnd = () => {
      window.setTimeout(handleSelectionEnd, 30);
    };

    document.addEventListener('mouseup', handleSelectionEnd);
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('mouseup', handleSelectionEnd);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onTextSelection, isCaptureMode, pageNumber]);

  const openQuoteShare = useCallback(async () => {
    if (!shareSelection) return;
    const bookTitle = inferCurrentBookTitle();
    const locationLabel = `Página ${shareSelection.page}`;
    const shareText = buildQuoteShareText(shareSelection.text, bookTitle, locationLabel, window.location.href);
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      // The share sheet repeats the copy attempt; clipboard permission may be unavailable here.
    }
    window.getSelection()?.removeAllRanges();
    setShareOpen(true);
  }, [shareSelection]);

  const closeQuoteShare = useCallback(() => {
    setShareOpen(false);
    setShareSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return (
    <div
      className={cn(
        'min-h-full flex flex-col items-center justify-start p-0 sm:p-8 transition-colors duration-500',
        isSimplified && 'bg-stone-900 transition-none',
        themeStyles[theme]
      )}
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

      <AnimatePresence>
        {shareSelection && !shareOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void openQuoteShare()}
            className="fixed z-[110] flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-400/30 bg-stone-900/95 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-300 shadow-2xl backdrop-blur-md hover:bg-stone-800"
            style={{
              left: `${Math.min(window.innerWidth - 54, Math.max(54, shareSelection.x + 92))}px`,
              top: `${Math.max(8, shareSelection.y - 50)}px`,
              transform: 'translateX(-50%)',
            }}
          >
            <Share2 size={13} /> Compartir
          </motion.button>
        )}
      </AnimatePresence>

      {shareSelection && shareOpen && (
        <QuoteShareSheet
          text={shareSelection.text}
          bookTitle={inferCurrentBookTitle()}
          locationLabel={`Página ${shareSelection.page}`}
          url={window.location.href}
          onClose={closeQuoteShare}
        />
      )}

      {isReaderMode || fileType === 'txt' ? (
        <div
          className={cn(
            'relative max-w-2xl w-full p-6 sm:p-12 font-serif leading-relaxed shadow-xl rounded-2xl min-h-[80vh] selection:bg-amber-200 selection:text-amber-900 transition-all duration-300 flex flex-col gap-2',
            themeStyles[theme]
          )}
          style={{ fontSize: `${(typeof zoom === 'number' ? zoom : 1) * 1.25}rem` }}
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
                        paperOn && 'paper-soul-ink'
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
              <p className="font-mono text-xs uppercase tracking-widest">Extracting text for reader mode...</p>
            </div>
          )}
        </div>
      ) : fileType === 'pdf' ? (
        <div
          className="relative shadow-2xl flex flex-col gap-0 py-0"
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
                const isVisible = isPageInRenderWindow(p, pageNumber);
                const ratio = pageRatios[p - 1] || 595 / 842;
                const calculatedHeight = (zoom * 800) / ratio;
                const minWidth = Math.min(
                  window.innerWidth * 0.9,
                  zoom * 800
                );
                const pageStains = paperOn ? stainsForPage(manifest, p) : [];

                return (
                  <div
                    key={`page-item-${p}`}
                    className="relative"
                    style={{ minHeight: calculatedHeight }}
                  >
                    {/* Filter on canvas only — PaperLayer is a sibling so it stays unfiltered */}
                    <div style={{ filter: pdfFilter[theme] }}>
                      <PageItem
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
                    </div>
                    {paperOn && (
                      <PaperLayer
                        active={pageStains}
                        grainUrl={grainUrl}
                        className="z-[5]"
                      />
                    )}
                  </div>
                );
              })
            )}
          </Document>
        </div>
      ) : fileType === 'epub' ? (
        <div className="relative w-full h-[calc(100vh-120px)] flex flex-col">
          {paperOn && <PaperLayer active={active} grainUrl={grainUrl} />}
          <div className="relative z-[1] flex-1 flex flex-col min-h-0">
            <EpubView 
              fileUrl={fileUrl} 
              theme={theme} 
              initialLocation={epubCfi} 
              onLocationChange={onEpubLocationChange} 
            />
          </div>
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