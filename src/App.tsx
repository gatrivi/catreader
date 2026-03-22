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
  ChevronRight,
  Library,
  BookOpen,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { syncService, ReadingProgress } from './services/syncService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// PDF.js worker setup
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Theme = 'light' | 'dark' | 'sepia';

interface LibraryBook {
  id: string;
  title: string;
  filename: string;
}

export default function App() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [theme, setTheme] = useState<Theme>('light');
  const [showUI, setShowUI] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [showLibrary, setShowLibrary] = useState<boolean>(false);
  const [library, setLibrary] = useState<LibraryBook[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [quadrant, setQuadrant] = useState(1);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide UI
  const resetUITimer = useCallback(() => {
    setShowUI(true);
    if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    uiTimeoutRef.current = setTimeout(() => {
      if (fileUrl) setShowUI(false);
    }, 4000);
  }, [fileUrl]);

  useEffect(() => {
    resetUITimer();
    return () => { if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current); };
  }, [resetUITimer]);

  // Load Library from API
  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/books');
      const data = await res.json();
      setLibrary(data);
    } catch (err) {
      console.error('Failed to fetch library:', err);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // Load Progress from KVDB
  const loadProgress = async (id: string) => {
    setIsSyncing(true);
    try {
      const progress = await syncService.loadProgress(id);
      if (progress) {
        setPageNumber(progress.page || 1);
        setZoom(progress.zoom || 1.0);
        setTheme(progress.theme as Theme || 'light');
        setLastSyncTime(progress.updatedAt);
      } else {
        // Fallback to local storage if KVDB is empty
        const local = localStorage.getItem(`catreader_progress_${id}`);
        if (local) {
          const { page, zoom, theme } = JSON.parse(local);
          setPageNumber(page || 1);
          setZoom(zoom || 1.0);
          setTheme(theme || 'light');
        } else {
          setPageNumber(1);
          setZoom(1.0);
          setTheme('light');
        }
      }
    } catch (err) {
      console.error('Sync load error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Save Progress to KVDB
  const saveProgress = useCallback(async () => {
    if (!fileName || !isLoaded) return;
    
    setIsSyncing(true);
    const now = Date.now();
    const progress: ReadingProgress = { 
      page: pageNumber, 
      zoom, 
      theme,
      updatedAt: now
    };
    
    // Save to both for redundancy
    localStorage.setItem(`catreader_progress_${fileName}`, JSON.stringify(progress));
    await syncService.saveProgress(fileName, progress);
    
    setLastSyncTime(now);
    setIsSyncing(false);
  }, [fileName, pageNumber, zoom, theme, isLoaded]);

  // Debounced save
  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(saveProgress, 3000); // Save every 3 seconds of inactivity
      return () => clearTimeout(timer);
    }
  }, [saveProgress, isLoaded]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      setFileName(file.name);
      loadProgress(file.name);
      setIsLoaded(false);
    }
  };

  const openFromLibrary = (book: LibraryBook) => {
    const url = `/books/${book.filename}`;
    setFileUrl(url);
    setFileName(book.filename);
    loadProgress(book.filename);
    setShowLibrary(false);
    setIsLoaded(false);
  };

  const changePage = (offset: number) => {
    const newPage = Math.min(Math.max(1, pageNumber + offset), numPages);
    if (newPage !== pageNumber) {
      setPageNumber(newPage);
      if (containerRef.current) containerRef.current.scrollTo(0, 0);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const width = window.innerWidth;
    const clickX = e.clientX;
    if (clickX > width * 0.7) changePage(1);
    else if (clickX < width * 0.3) changePage(-1);
    resetUITimer();
  };

  // Quadrant logic for breadcrumbs
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = containerRef.current;
      const maxScrollX = scrollWidth - clientWidth;
      const maxScrollY = scrollHeight - clientHeight;
      if (maxScrollX <= 0 && maxScrollY <= 0) { setQuadrant(1); return; }
      const midX = maxScrollX / 2;
      const midY = maxScrollY / 2;
      if (scrollLeft <= midX && scrollTop <= midY) setQuadrant(1);
      else if (scrollLeft > midX && scrollTop <= midY) setQuadrant(2);
      else if (scrollLeft <= midX && scrollTop > midY) setQuadrant(3);
      else setQuadrant(4);
    };
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [isLoaded]);

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
              <span className="text-sm font-medium truncate max-w-[100px]">{fileName || 'Reader'}</span>
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

            <div className="flex items-center gap-1">
              <button onClick={() => { setShowLibrary(true); fetchLibrary(); }} className="p-1.5 hover:bg-white/10 rounded-full" title="Biblioteca"><Library size={14}/></button>
              <label className="p-1.5 hover:bg-white/10 rounded-full cursor-pointer" title="Subir PDF">
                <Upload size={14}/>
                <input type="file" accept=".pdf" className="hidden" onChange={onFileChange} />
              </label>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Breadcrumbs Overlay */}
      <div className="fixed bottom-2 left-4 z-40 flex items-center gap-2 text-[10px] font-mono select-none uppercase tracking-widest">
        <div className={cn(
          "w-2 h-2 rounded-full",
          isSyncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
        )} />
        <span className="opacity-40">{isSyncing ? 'Syncing...' : 'Cloud Sync Active'}</span>
        {fileName && (
          <>
            <span className="text-stone-500 opacity-40">/</span>
            <span className="truncate max-w-[120px] opacity-40">{fileName}</span>
            <span className="text-stone-500 opacity-40">/</span>
            <span className="opacity-40">P.{pageNumber}</span>
            <span className="text-stone-500 opacity-40">/</span>
            <div className="grid grid-cols-2 gap-0.5 w-3 h-3 border border-current opacity-30">
              <div className={cn("w-full h-full", quadrant === 1 ? "bg-current" : "bg-transparent")} />
              <div className={cn("w-full h-full", quadrant === 2 ? "bg-current" : "bg-transparent")} />
              <div className={cn("w-full h-full", quadrant === 3 ? "bg-current" : "bg-transparent")} />
              <div className={cn("w-full h-full", quadrant === 4 ? "bg-current" : "bg-transparent")} />
            </div>
          </>
        )}
      </div>

      {/* Main Viewer */}
      <main 
        ref={containerRef}
        className="flex-1 overflow-auto scrollbar-none"
        onDoubleClick={handleDoubleClick}
      >
        {!fileUrl ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-xs"
            >
              <div className="w-16 h-16 bg-indigo-500 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-indigo-500/40">
                <BookOpen size={32} />
              </div>
              <h1 className="text-3xl font-black mb-2 tracking-tight">CatReader</h1>
              <p className="text-stone-500 mb-8 text-sm">Your library is automatically detected from <code>/public/books/</code>.</p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => { setShowLibrary(true); fetchLibrary(); }}
                  className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <Library size={18} />
                  Abrir Biblioteca
                </button>
                <label className="bg-stone-800 text-white px-8 py-3 rounded-2xl font-bold hover:bg-stone-700 transition-all cursor-pointer flex items-center justify-center gap-2">
                  <Upload size={18} />
                  Subir Localmente
                  <input type="file" accept=".pdf" className="hidden" onChange={onFileChange} />
                </label>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="min-h-full flex justify-center p-0 sm:p-4">
            <div className="relative" style={{ filter: pdfFilter[theme] }}>
              <Document
                file={fileUrl}
                onLoadSuccess={({ numPages }) => { setNumPages(numPages); setIsLoaded(true); }}
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
        {showUI && fileUrl && (
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
            
            {isSyncing && <Loader2 size={12} className="animate-spin absolute -right-6 text-indigo-400" />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Library Modal */}
      <AnimatePresence>
        {showLibrary && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-stone-900 w-full max-w-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Library className="text-indigo-400" size={24} />
                  <h2 className="text-xl font-bold text-white">Biblioteca</h2>
                </div>
                <button onClick={() => setShowLibrary(false)} className="text-stone-500 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {library.length === 0 ? (
                  <div className="text-center py-20 text-stone-500">
                    <p className="mb-4">No se han detectado libros en <code>/public/books/</code></p>
                    <p className="text-xs">Sube tus PDFs a esa carpeta para que aparezcan aquí.</p>
                  </div>
                ) : (
                  library.map(book => (
                    <button 
                      key={book.id}
                      onClick={() => openFromLibrary(book)}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all text-left group"
                    >
                      <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                        <BookOpen size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{book.title}</p>
                        <p className="text-stone-500 text-[10px] font-mono uppercase tracking-tighter">{book.filename}</p>
                      </div>
                      <ChevronRight size={16} className="text-stone-700 group-hover:text-white transition-colors" />
                    </button>
                  ))
                )}
              </div>
              
              <div className="p-4 bg-stone-950/50 text-[10px] text-stone-600 text-center uppercase tracking-widest">
                Los libros se detectan automáticamente desde <code>/public/books/</code>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
