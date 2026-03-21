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
  CloudUpload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, storage } from './firebase';
import { doc, setDoc, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getMetadata } from 'firebase/storage';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// PDF.js worker setup
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Theme = 'light' | 'dark' | 'sepia';

const PERSONAL_USER_ID = 'catreader_personal_user';
const STORAGE_PATH = 'books/current.pdf';

export default function App() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [theme, setTheme] = useState<Theme>('light');
  const [showUI, setShowUI] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<number>(0);
  const isRemoteUpdateRef = useRef<boolean>(false);
  const [dbStatus, setDbStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [isRemoteSyncing, setIsRemoteSyncing] = useState(false);

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

  // Initial Load: Fetch last book from Storage and check DB
  useEffect(() => {
    const init = async () => {
      try {
        // Test DB connection
        const testRef = doc(db, 'global_state', 'current');
        await getDoc(testRef);
        setDbStatus('connected');

        const fileRef = ref(storage, STORAGE_PATH);
        const url = await getDownloadURL(fileRef);
        const metadata = await getMetadata(fileRef);
        setFileName(metadata.customMetadata?.originalName || 'Current Book');
        setFileUrl(url);
      } catch (err) {
        console.log('Initialization info:', err);
        setDbStatus('connected'); // Assume connected if we can at least try
        setIsSyncing(false);
      }
    };
    init();
  }, []);

  // Sync Progress & Pan/Zoom from Firestore
  useEffect(() => {
    if (!fileUrl) return;
    
    const unsub = onSnapshot(doc(db, 'global_state', 'current'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        
        // Prevent feedback loop
        isRemoteUpdateRef.current = true;
        setIsRemoteSyncing(true);
        setTimeout(() => setIsRemoteSyncing(false), 1000);
        
        if (data.currentPage !== undefined && data.currentPage !== pageNumber) {
          setPageNumber(data.currentPage);
        }
        
        if (data.zoom !== undefined && Math.abs(data.zoom - zoom) > 0.01) {
          setZoom(data.zoom);
        }
        
        if (data.theme !== undefined && data.theme !== theme) {
          setTheme(data.theme);
        }
        
        // Sync scroll position
        if (containerRef.current && (data.scrollX !== undefined || data.scrollY !== undefined)) {
          const currentX = containerRef.current.scrollLeft;
          const currentY = containerRef.current.scrollTop;
          
          if (Math.abs(currentX - data.scrollX) > 10 || Math.abs(currentY - data.scrollY) > 10) {
            containerRef.current.scrollTo({
              left: data.scrollX,
              top: data.scrollY,
              behavior: 'smooth'
            });
          }
        }
        
        setIsSyncing(false);
        setTimeout(() => { isRemoteUpdateRef.current = false; }, 800);
      }
    }, (err) => {
      console.error('Sync error:', err);
      setDbStatus('error');
    });
    return () => unsub();
  }, [fileUrl]);

  const saveState = async (updates: any = {}) => {
    if (!fileUrl || isRemoteUpdateRef.current) return;
    
    setIsSaving(true);
    try {
      const scrollX = containerRef.current?.scrollLeft || 0;
      const scrollY = containerRef.current?.scrollTop || 0;
      
      await setDoc(doc(db, 'global_state', 'current'), {
        currentPage: pageNumber,
        zoom,
        scrollX,
        scrollY,
        theme,
        updatedAt: serverTimestamp(),
        ...updates
      }, { merge: true });
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Debounced save for scroll/zoom
  useEffect(() => {
    if (!isLoaded || isSyncing) return;
    const timer = setTimeout(() => {
      saveState();
    }, 1500);
    return () => clearTimeout(timer);
  }, [zoom, theme, isLoaded, isSyncing, pageNumber]);

  // Helper to determine quadrant
  const getQuadrant = () => {
    if (!containerRef.current) return 0;
    const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = containerRef.current;
    const maxScrollX = scrollWidth - clientWidth;
    const maxScrollY = scrollHeight - clientHeight;
    
    if (maxScrollX <= 0 && maxScrollY <= 0) return 1;
    
    const midX = maxScrollX / 2;
    const midY = maxScrollY / 2;
    
    if (scrollLeft <= midX && scrollTop <= midY) return 1; // Top Left
    if (scrollLeft > midX && scrollTop <= midY) return 2;  // Top Right
    if (scrollLeft <= midX && scrollTop > midY) return 3;  // Bottom Left
    return 4; // Bottom Right
  };

  const [quadrant, setQuadrant] = useState(1);
  useEffect(() => {
    const handleScroll = () => setQuadrant(getQuadrant());
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [isLoaded]);

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile?.type === 'application/pdf') {
      setIsUploading(true);
      try {
        const fileRef = ref(storage, STORAGE_PATH);
        await uploadBytes(fileRef, selectedFile, {
          customMetadata: { originalName: selectedFile.name }
        });
        const url = await getDownloadURL(fileRef);
        setFileName(selectedFile.name);
        setFileUrl(url);
        setPageNumber(1);
        setIsLoaded(false);
        // Reset state in Firestore for new book
        await saveState({ currentPage: 1, scrollX: 0, scrollY: 0, zoom: 1.0 });
      } catch (err) {
        console.error('Upload error:', err);
      } finally {
        setIsUploading(false);
      }
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
      saveState({ currentPage: newPage, scrollX: 0, scrollY: 0 });
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

            <label className="p-1.5 hover:bg-white/10 rounded-full cursor-pointer">
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
              <input type="file" accept=".pdf" onChange={onFileChange} className="hidden" />
            </label>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Breadcrumbs Overlay (Subtle) */}
      <div className="fixed bottom-2 left-4 z-40 flex items-center gap-2 text-[10px] font-mono opacity-30 pointer-events-none select-none uppercase tracking-widest">
        <span className={cn(
          dbStatus === 'connected' ? 'text-emerald-500' : 'text-amber-500',
          isRemoteSyncing && "animate-pulse brightness-150"
        )}>
          {dbStatus === 'connected' ? 'Biblioteca' : 'Conectando...'}
        </span>
        {fileName && (
          <>
            <span className="text-stone-500">/</span>
            <span className="truncate max-w-[120px]">{fileName}</span>
            <span className="text-stone-500">/</span>
            <span>P.{pageNumber}</span>
            <span className="text-stone-500">/</span>
            <div className="grid grid-cols-2 gap-0.5 w-3 h-3 border border-current opacity-60">
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
        onTouchStart={handleTouch}
        onScroll={() => {
          if (isLoaded && !isRemoteUpdateRef.current) {
            // Debounced save handled by useEffect
          }
        }}
      >
        {!fileUrl ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="max-w-xs"
            >
              <div className="w-16 h-16 bg-indigo-500 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-indigo-500/40">
                {isUploading ? <Loader2 size={32} className="animate-spin" /> : <Upload size={32} />}
              </div>
              <h1 className="text-3xl font-black mb-2 tracking-tight">CatReader</h1>
              <p className="text-stone-500 mb-8 text-sm">Upload a PDF. It will be saved in the cloud and open automatically on all your devices.</p>
              <label className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold cursor-pointer hover:bg-indigo-700 transition-all block">
                {isUploading ? 'Uploading...' : 'Open Document'}
                <input type="file" accept=".pdf" onChange={onFileChange} className="hidden" />
              </label>
            </motion.div>
          </div>
        ) : (
          <div className="min-h-full flex justify-center p-0 sm:p-4">
            <div className="relative" style={{ filter: pdfFilter[theme] }}>
              <Document
                file={fileUrl}
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
            
            {(isSaving || isSyncing) && <Loader2 size={12} className="animate-spin absolute -right-6 text-indigo-400" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
