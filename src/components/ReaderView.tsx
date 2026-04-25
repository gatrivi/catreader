import React from 'react';
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
  themeStyles: Record<string, string>;
  pdfFilter: Record<string, string>;
  isSimplified: boolean;
}

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
  onLoadSuccess,
  onPageRenderSuccess,
  themeStyles,
  pdfFilter,
  isSimplified
}) => {
  return (
    <div className={cn("min-h-full flex flex-col items-center justify-start p-0 sm:p-8", isSimplified && "bg-stone-900 transition-none")}>
      {fileType === 'pdf' ? (
        <div className="relative shadow-2xl flex flex-col gap-0 py-0" style={{ filter: pdfFilter[theme] }}>
          <Document
            file={fileUrl}
            onLoadSuccess={onLoadSuccess}
            loading={<div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={48}/></div>}
          >
            {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
              const isVisible = Math.abs(p - pageNumber) <= 8;
              const ratio = pageRatios[p - 1] || 595/842;
              const calculatedHeight = (zoom * 800) / ratio;

              return (
                <div 
                  key={`page-wrap-${p}`} 
                  id={`page-${p}`}
                  data-page={p}
                  className="page-wrapper bg-white shadow-lg mb-8 mx-auto transition-all duration-300"
                  style={{ 
                    width: 'fit-content',
                    minWidth: Math.min(window.innerWidth * 0.9, zoom * 800),
                    minHeight: calculatedHeight,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  {isVisible ? (
                    <Page 
                      pageNumber={p} 
                      scale={zoom} 
                      width={800}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      loading={<div style={{ height: calculatedHeight }} className="flex items-center justify-center text-stone-500/20 font-serif italic">Cargando página {p}...</div>}
                      onRenderSuccess={() => onPageRenderSuccess(p)}
                    />
                  ) : null}
                </div>
              );
            })}
          </Document>
        </div>
      ) : fileType === 'txt' ? (
        <div className={cn("max-w-3xl w-full p-8 font-mono whitespace-pre-wrap leading-relaxed shadow-sm rounded-lg", themeStyles[theme])}>
          {textContent}
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle size={48} className="text-amber-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Formato no soportado</h2>
          <p className="text-stone-500">Actualmente solo soportamos PDF y TXT. Estamos trabajando en EPUB y DOCS.</p>
        </div>
      )}
    </div>
  );
};
