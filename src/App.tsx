/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { 
  Upload, 
  ZoomIn, 
  ZoomOut, 
  Sun, 
  Moon, 
  Coffee, 
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from './firebase';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Theme = 'light' | 'dark' | 'sepia';

const PERSONAL_USER_ID = 'catreader_personal_user';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [theme, setTheme] = useState<Theme>('light');
  const [showUI, setShowUI] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<number>(0);

  // Auto-hide UI
  const resetUITimer = useCallback(() => {
    setShowUI(true);
    if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    uiTimeoutRef.current = setTimeout(() => {
      if (file) setShowUI(false);
    }, 3000);
  }, [file]);

  useEffect(() => {
    resetUITimer();
    return () => { if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current); };
  }, [resetUITimer]);

  // Sync Progress from Firestore
  useEffect(() => {
    if (!file) return;
    
    const docId = `${PERSONAL_USER_ID}_${file.name}`;
    const unsub = onSnapshot(doc(db, 'reading_progress', docId), (snap) => {
      if (snap.exists() && !isSaving) {
        const data = snap.data();
        if (data.currentPage !== pageNumber) setPageNumber(data.currentPage);
        if (data.zoom !== zoom) setZoom(data.zoom);
        if (data.theme !== theme) setTheme(data.theme);
        
        // Sync scroll position
        if (containerRef.current && (data.scrollX !== undefined || data.scrollY !== undefined)) {
          containerRef.current.scrollTo({
            left: data.scrollX || 0,
            top: data.scrollY || 0,
            behavior: 'smooth'
          });
        }
      }
    });
    return () => unsub();
  }, [file]);

  const saveProgress = async (overridePage?: number, resetScroll = false) => {
    if (!file) return;
    setIsSaving(true);
    try {
      const docId = `${PERSONAL_USER_ID}_${file.name}`;
      const scrollX = resetScroll ? 0 : containerRef.current?.scrollLeft || 0;
      const scrollY = resetScroll ? 0 : containerRef.current?.scrollTop || 0;
      
      await setDoc(doc(db, 'reading_progress', docId), {
        userId: PERSONAL_USER_ID,
        pdfId: file.name,
        currentPage: overridePage ?? pageNumber,
        totalPages: numPages,
        zoom,
        scrollX,
        scrollY,
        theme,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await setDoc(doc(db, 'global_state', 'current'), {
        lastPdfId: file.name,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Debounced save for scroll/zoom
  useEffect(() => {
    const timer = setTimeout(() => {
      if (file && isLoaded) saveProgress();
    }, 1500);
    return () => clearTimeout(timer);
  }, [zoom, theme, isLoaded]);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile?.type === 'application/pdf') {
      setFile(selectedFile);
      setIsLoaded(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoaded(true);
  };

  const changePage = (offset: number) => {
    const newPage = Math.min(Math.max(1, pageNumber + offset), numPages);
    if (newPage !== pageNumber) {
      setPageNumber(newPage);
      if (containerRef.current) {
        containerRef.current.scrollTo(0, 0);
      }
      saveProgress(newPage, true);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const width = window.innerWidth;
    const clickX = e.clientX;
    if (clickX > width * 0.7) {
      changePage(1);
    } else if (clickX < width * 0.3) {
      changePage(-1);
    }
    resetUITimer();
  };

  const handleTouch = (e: React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      const width = window.innerWidth;
      const touchX = e.touches[0].clientX;
      if (touchX > width * 0.7) {
        changePage(1);
      } else if (touchX < width * 0.3) {
        changePage(-1);
      }
    }
    lastTapRef.current = now;
    resetUITimer();
  };

  const themeStyles = {
    light: 'bg-white text-stone-900',
    dark: 'bg-black text-stone-100',
    sepia: 'bg-[#f4ecd8] text-[#5b4636]'
  };

  const pdfFilter = {
    light: '',
    dark: 'invert(1) hue-rotate(180deg) contrast(0.9)',
    sepia: 'sepia(0.3) contrast(0.95) brightness(0.95)'
  };

  return (
    <div 
      className={cn("fixed inset-0 overflow-hidden flex flex-col transition-colors duration-500", themeStyles[theme])}
      onMouseMove={resetUITimer}
      onTouchStart={resetUITimer}
    >
      {/* Floating Header */}
      <AnimatePresence>
        {showUI && (
          <motion.header 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-stone-900/90 text-white px-4 py-2 rounded-full shadow-2xl backdrop-blur-sm border border-white/10"
          >
            <div className="flex items-center gap-2 pr-2 border-r border-white/20">
              <span className="text-xs font-bold tracking-tighter bg-indigo-500 px-1.5 py-0.5 rounded">CAT</span>
              <span className="text-sm font-medium truncate max-w-[100px]">{file?.name || 'Reader'}</span>
            </div>
            
            <div className="flex items-center gap-1">
              <button onClick={() => setTheme('light')} className={cn("p-1.5 rounded-full", theme === 'light' && "bg-white/20")}><Sun size={14}/></button>
              <button onClick={() => setTheme('sepia')} className={cn("p-1.5 rounded-full", theme === 'sepia' && "bg-white/20")}><Coffee size={14}/></button>
              <button onClick={() => setTheme('dark')} className={cn("p-1.5 rounded-full", theme === 'dark' && "bg-white/20")}><Moon size={14}/></button>
            </div>

            <div className="w-px h-4 bg-white/20 mx-1" />

            <div className="flex items-center gap-1">
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1.5 hover:bg-white/10 rounded-full"><ZoomOut size={14}/></button>
              <span className="text-[10px] font-mono w-8 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1.5 hover:bg-white/10 rounded-full"><ZoomIn size={14}/></button>
            </div>

            <div className="w-px h-4 bg-white/20 mx-1" />

            <label className="p-1.5 hover:bg-white/10 rounded-full cursor-pointer">
              <Upload size={14} />
              <input type="file" accept=".pdf" onChange={onFileChange} className="hidden" />
            </label>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main Viewer */}
      <main 
        ref={containerRef}
        className="flex-1 overflow-auto scrollbar-none"
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouch}
      >
        {!file ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-xs"
            >
              <div className="w-16 h-16 bg-indigo-500 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-indigo-500/40">
                <Upload size={32} />
              </div>
              <h1 className="text-3xl font-black mb-2 tracking-tight">CatReader</h1>
              <p className="text-stone-500 mb-8 text-sm">Drop a PDF to start reading. Your progress syncs across all your devices.</p>
              <label className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold cursor-pointer hover:bg-indigo-700 transition-all block">
                Open Document
                <input type="file" accept=".pdf" onChange={onFileChange} className="hidden" />
              </label>
            </motion.div>
          </div>
        ) : (
          <div className="min-h-full flex justify-center p-0 sm:p-4">
            <div className="relative" style={{ filter: pdfFilter[theme] }}>
              <Document
                file={file}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={<div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={48}/></div>}
              >
                <Page 
                  pageNumber={pageNumber} 
                  scale={zoom} 
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-2xl"
                />
              </Document>
            </div>
          </div>
        )}
      </main>

      {/* Floating Page Indicator */}
      <AnimatePresence>
        {showUI && file && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-stone-900/90 text-white px-6 py-3 rounded-full shadow-2xl backdrop-blur-sm border border-white/10"
          >
            <button onClick={() => changePage(-1)} disabled={pageNumber <= 1} className="disabled:opacity-20"><ChevronLeft size={20}/></button>
            <div className="flex flex-col items-center">
              <span className="text-xs font-mono">{pageNumber} / {numPages}</span>
              <div className="w-24 h-1 bg-white/20 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(pageNumber / numPages) * 100}%` }} />
              </div>
            </div>
            <button onClick={() => changePage(1)} disabled={pageNumber >= numPages} className="disabled:opacity-20"><ChevronRight size={20}/></button>
            
            {isSaving && <Loader2 size={12} className="animate-spin absolute -right-6 text-indigo-400" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
