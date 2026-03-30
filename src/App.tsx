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
  AlertCircle,
  Cloud
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

declare var google: any;
declare var gapi: any;

// Google Drive Config
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || 'AIzaSyBvydI7C1p9ErqnIoY4VqFrM9TeBESTWLg';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

type Theme = 'light' | 'dark' | 'sepia';

interface LibraryBook {
  id: string;
  title: string;
  filename: string;
  type: string;
}

/**
 * CatReader - Main Application Component
 * 
 * This component handles the core functionality of the reader, including:
 * - Rendering PDFs and Text files
 * - Managing reading progress (page, zoom, theme)
 * - Synchronizing progress with KVDB
 * - Integrating with Google Drive for file picking and uploading
 * - Managing the local library of books
 */
export default function App() {
  // --- State Management ---
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileType, setFileType] = useState<string>('pdf');
  const [textContent, setTextContent] = useState<string | null>(null);
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
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  
  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gapiLoaded = useRef(false);
  const gisLoaded = useRef(false);

  // --- Effects ---
  
  /**
   * Load Google API scripts on component mount.
   * Required for Google Drive integration.
   */
  useEffect(() => {
    const loadScripts = () => {
      const gapiScript = document.createElement('script');
      gapiScript.src = 'https://apis.google.com/js/api.js';
      gapiScript.async = true;
      gapiScript.defer = true;
      gapiScript.onload = () => { gapiLoaded.current = true; };
      document.body.appendChild(gapiScript);

      const gisScript = document.createElement('script');
      gisScript.src = 'https://accounts.google.com/gsi/client';
      gisScript.async = true;
      gisScript.defer = true;
      gisScript.onload = () => { gisLoaded.current = true; };
      document.body.appendChild(gisScript);
    };
    loadScripts();
  }, []);

  /**
   * Initiates the Google Drive authentication flow.
   * Prompts for Client ID if not configured in environment variables.
   */
  const handleGoogleDrive = () => {
    if (!GOOGLE_CLIENT_ID) {
      const cid = prompt('Por favor, introduce tu Google Client ID (puedes obtenerlo en Google Cloud Console):');
      if (!cid) return;
      // We can't set env vars at runtime, but we can use this for the session
      (window as any)._GOOGLE_CLIENT_ID = cid;
    }

    const clientId = GOOGLE_CLIENT_ID || (window as any)._GOOGLE_CLIENT_ID;

    if (typeof google === 'undefined' || !google.accounts) {
      alert('Las librerías de Google aún se están cargando. Por favor, espera un momento.');
      return;
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
      callback: (response: any) => {
        if (response.access_token) {
          setGoogleToken(response.access_token);
          createPicker(response.access_token);
        }
      },
    });

    if (googleToken) {
      createPicker(googleToken);
    } else {
      tokenClient.requestAccessToken();
    }
  };

  /**
   * Creates and displays the Google Picker UI.
   * Allows users to select supported documents from their Drive.
   * @param token - The Google OAuth access token
   */
  const createPicker = (token: string) => {
    gapi.load('picker', () => {
      const view = new google.picker.View(google.picker.ViewId.DOCS);
      view.setMimeTypes('application/pdf,text/plain,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword');
      
      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback(async (data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const file = data.docs[0];
            const fileId = file.id;
            const fileName = file.name;
            const ext = fileName.split('.').pop()?.toLowerCase() || 'pdf';
            
            setIsSyncing(true);
            try {
              const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              setFileUrl(url);
              setFileName(fileName);
              setFileType(ext);
              
              if (ext === 'txt') {
                const text = await blob.text();
                setTextContent(text);
                setNumPages(1);
              } else {
                setTextContent(null);
              }
              
              await loadProgress(fileName);
              if (ext === 'txt') setIsLoaded(true);
              else setIsLoaded(false);
            } catch (err) {
              console.error('Error fetching Google Drive file:', err);
              alert('Error al descargar el archivo de Google Drive.');
            } finally {
              setIsSyncing(false);
            }
          }
        })
        .build();
      picker.setVisible(true);
    });
  };

  /**
   * Uploads a local file to the user's Google Drive.
   * @param file - The file to upload
   * @param token - The Google OAuth access token
   * @returns The ID of the uploaded file, or null if failed
   */
  const uploadToDrive = async (file: File, token: string) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      epub: 'application/epub+zip',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword'
    };

    const metadata = {
      name: file.name,
      mimeType: mimeTypes[ext] || 'application/octet-stream',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    try {
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json();
      console.log('File uploaded to Drive:', data);
      return data.id;
    } catch (err) {
      console.error('Error uploading to Drive:', err);
      return null;
    }
  };

  /**
   * Resets the auto-hide timer for the UI overlays.
   * Hides the UI after 4 seconds of inactivity.
   */
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

  /**
   * Fetches the list of available books from the statically generated books.json.
   * This file is generated during the build process or via the predev script.
   */
  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/books.json');
      if (!res.ok) throw new Error('books.json not found');
      const data = await res.json();
      setLibrary(data);
    } catch (err) {
      console.error('Failed to fetch library:', err);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  /**
   * Loads reading progress for a specific book from KVDB or localStorage.
   * @param id - The unique identifier (filename) of the book
   */
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

  /**
   * Saves the current reading progress to KVDB and localStorage.
   * This function is debounced to prevent excessive API calls.
   */
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
    
    await syncService.saveProgress(fileName, progress);
    
    setLastSyncTime(now);
    setIsSyncing(false);
  }, [fileName, pageNumber, zoom, theme, isLoaded]);

  // Debounced save for Cloud Sync
  useEffect(() => {
    if (isLoaded && fileName) {
      const timer = setTimeout(saveProgress, 3000); // Save every 3 seconds of inactivity
      return () => clearTimeout(timer);
    }
  }, [saveProgress, isLoaded, fileName]);

  /**
   * Immediate local storage save for better reliability.
   * This ensures that even if the user closes the tab immediately, progress is saved.
   */
  useEffect(() => {
    if (fileName && isLoaded) {
      const progress = { 
        page: pageNumber, 
        zoom, 
        theme, 
        updatedAt: Date.now() 
      };
      localStorage.setItem(`catreader_progress_${fileName}`, JSON.stringify(progress));
    }
  }, [fileName, pageNumber, zoom, theme, isLoaded]);

  /**
   * Handles file selection from the local filesystem.
   * @param e - The file input change event
   */
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      setFileUrl(url);
      setFileName(file.name);
      setFileType(ext);
      
      if (ext === 'txt') {
        const text = await file.text();
        setTextContent(text);
        setNumPages(1);
      } else {
        setTextContent(null);
      }
      
      await loadProgress(file.name);
      if (ext === 'txt') setIsLoaded(true);
      else setIsLoaded(false);

      // If user is signed in to Google, upload to Drive too
      if (googleToken) {
        await uploadToDrive(file, googleToken);
      }
    }
  };

  /**
   * Opens a book from the local library.
   * @param book - The library book object to open
   */
  const openFromLibrary = async (book: LibraryBook) => {
    const url = `/books/${book.filename}`;
    setFileUrl(url);
    setFileName(book.filename);
    setFileType(book.type);
    
    if (book.type === 'txt') {
      try {
        const res = await fetch(url);
        const text = await res.text();
        setTextContent(text);
        setNumPages(1);
      } catch (err) {
        console.error('Error loading text file:', err);
      }
    } else {
      setTextContent(null);
    }
    
    await loadProgress(book.filename);
    setShowLibrary(false);
    if (book.type === 'txt') setIsLoaded(true);
    else setIsLoaded(false);
  };

  /**
   * Changes the current page by a given offset.
   * @param offset - The number of pages to move (e.g., 1 or -1)
   */
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
              <button onClick={() => { setFileUrl(null); setFileName(''); }} className="p-1.5 hover:bg-white/10 rounded-full" title="Cerrar Libro"><X size={14}/></button>
              <button onClick={() => { setShowLibrary(true); fetchLibrary(); }} className="p-1.5 hover:bg-white/10 rounded-full" title="Biblioteca"><Library size={14}/></button>
              <button onClick={handleGoogleDrive} className="p-1.5 hover:bg-white/10 rounded-full" title="Google Drive"><Cloud size={14}/></button>
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
                <button 
                  onClick={handleGoogleDrive}
                  className="bg-stone-800 text-white px-8 py-3 rounded-2xl font-bold hover:bg-stone-700 transition-all flex items-center justify-center gap-2"
                >
                  <Cloud size={18} />
                  Google Drive
                </button>
                <label className="bg-stone-800/50 text-white px-8 py-3 rounded-2xl font-bold hover:bg-stone-700/50 transition-all cursor-pointer flex items-center justify-center gap-2">
                  <Upload size={18} />
                  Subir Localmente
                  <input type="file" accept=".pdf,.txt" className="hidden" onChange={onFileChange} />
                </label>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="min-h-full flex justify-center p-0 sm:p-4">
            {fileType === 'pdf' ? (
              <div className="relative" style={{ filter: pdfFilter[theme] }}>
                <Document
                  file={fileUrl}
                  onLoadSuccess={({ numPages }) => { setNumPages(numPages); setIsLoaded(true); }}
                  loading={<div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={48}/></div>}
                >
                  {/* Pre-buffer previous page for faster navigation */}
                  {pageNumber > 1 && (
                    <div className="absolute opacity-0 pointer-events-none -z-10">
                      <Page pageNumber={pageNumber - 1} scale={zoom} renderTextLayer={false} renderAnnotationLayer={false} />
                    </div>
                  )}
                  
                  {/* Current visible page */}
                  <Page 
                    pageNumber={pageNumber} 
                    scale={zoom} 
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="shadow-2xl"
                  />
                  
                  {/* Pre-buffer next page for faster navigation */}
                  {pageNumber < numPages && (
                    <div className="absolute opacity-0 pointer-events-none -z-10">
                      <Page pageNumber={pageNumber + 1} scale={zoom} renderTextLayer={false} renderAnnotationLayer={false} />
                    </div>
                  )}
                </Document>
              </div>
            ) : fileType === 'txt' ? (
              <div className={cn("max-w-3xl w-full p-8 font-mono whitespace-pre-wrap leading-relaxed", themeStyles[theme])}>
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
              <input 
                type="range" 
                min={1} 
                max={numPages || 1} 
                value={pageNumber} 
                onChange={(e) => {
                  const newPage = Number(e.target.value);
                  setPageNumber(newPage);
                  if (containerRef.current) containerRef.current.scrollTo(0, 0);
                }}
                className="w-32 h-1 bg-white/20 rounded-full mt-1 appearance-none cursor-pointer accent-indigo-500"
              />
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
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium truncate">{book.title}</p>
                          <span className="text-[8px] bg-stone-800 text-stone-400 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                            {book.type}
                          </span>
                        </div>
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
