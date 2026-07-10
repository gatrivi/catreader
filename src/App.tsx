/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs as pdfjsLib } from 'react-pdf';
import { 
  Upload,
  ZoomIn, 
  ZoomOut, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  Library,
  X,
  Cloud,
  MoreVertical,
  Maximize2,
  Pencil,
  Crop,
  BookText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { syncService, type Highlight } from './services/syncService';
import { coverDB } from './services/db';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";
import * as pdfjsBackground from 'pdfjs-dist/legacy/build/pdf.mjs';

// Setup pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
(pdfjsBackground as any).GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${(pdfjsBackground as any).version}/legacy/build/pdf.worker.min.mjs`;

// Component Imports
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { EditModal } from './components/EditModal';
import { useShelves } from './hooks/useShelves';
import { useGoogleDrive } from './hooks/useGoogleDrive';
import { useReaderSync } from './hooks/useReaderSync';
import { useLibrary, LibraryBook } from './hooks/useLibrary';

import { ProfileModal } from './components/ProfileModal';
import { authService } from './services/authService';
import { buildBookPath, parseBookPath, matchBookBySlug, getLibraryPath, resolveBookRoute, buildBookShareUrl } from './utils/routing';
import { displayBookTitle } from './components/BookCover';
import { clampPage, offsetPage } from './utils/reader';
import { PageInput } from './components/PageInput';
import { parsePdfPageSemantically } from './utils/pdfParser';
import { createThumbnail } from './utils/image';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function libraryUrl(): string {
  return new URL(getLibraryPath(), window.location.origin).toString();
}

/** Ensure browser Back returns to the gallery instead of leaving the site. */
function seedReaderHistoryStack(bookPath: string, filename: string) {
  const bookUrl = new URL(bookPath, window.location.origin).toString();
  window.history.replaceState({ view: 'library' }, '', libraryUrl());
  window.history.pushState({ view: 'reader', filename }, '', bookUrl);
}

function pushReaderHistory(bookPath: string, filename: string) {
  const bookUrl = new URL(bookPath, window.location.origin).toString();
  if (!parseBookPath(window.location.pathname)) {
    window.history.pushState({ view: 'reader', filename }, '', bookUrl);
    return;
  }
  if (window.history.state?.view !== 'reader' || window.history.length <= 1) {
    seedReaderHistoryStack(bookPath, filename);
    return;
  }
  window.history.pushState({ view: 'reader', filename }, '', bookUrl);
}

declare var google: any;
declare var gapi: any;

/**
 * CatReader - Main Application Component
 * v2.4.1 (Modularized)
 */
export default function App() {
  // --- State Management ---
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileType, setFileType] = useState<string>('pdf');
  const [textContent, setTextContent] = useState<string[] | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [showUI, setShowUI] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [globalStatus, setGlobalStatus] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<{ message: string; details?: string } | null>(null);
  const [renderErrors, setRenderErrors] = useState<Set<number>>(new Set());
  const [isManualHide, setIsManualHide] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isReaderMode, setIsReaderMode] = useState(false);
  const [isCaptureMode, setIsCaptureMode] = useState(false);
  const [showCoverLabels, setShowCoverLabels] = useState(localStorage.getItem('catreader_cover_labels') === 'true');
  const restoringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreTargetPageRef = useRef<number | null>(null);
  
  const loadGhostTextToState = useCallback((storedText: string) => {
    if (storedText.startsWith('[')) {
      try {
        const parsed = JSON.parse(storedText);
        if (Array.isArray(parsed)) {
          setTextContent(parsed);
          return;
        }
      } catch (e) { /* ignore */ }
    }
    if (storedText.includes('[Page ')) {
      const pages = storedText.split(/\[Page \d+\]\n/).filter(Boolean);
      setTextContent(pages);
    } else {
      setTextContent([storedText]);
    }
  }, []);

  const toggleReaderMode = async () => {
    const nextMode = !isReaderMode;
    setIsReaderMode(nextMode);
    
    if (nextMode && fileType === 'pdf' && !textContent) {
      const text = await coverDB.getGhostText(fileName);
      if (text) {
        loadGhostTextToState(text);
      } else if (fileUrl) {
        showToast('Extracting text...');
        try {
          const blob = await coverDB.getBookContent(fileName) || await fetch(fileUrl).then(r => r.blob());
          extractGhostTextLazy(blob, fileName);
        } catch (e) {
          console.error('[ReaderMode] Failed to start lazy extraction:', e);
        }
      }
    }
  };
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isSimplified, setIsSimplified] = useState(localStorage.getItem('catreader_simplified') === 'true');
  const [wallpaper, setWallpaper] = useState(localStorage.getItem('catreader_wallpaper') || 'gaston');
  const [customWallpaper, setCustomWallpaper] = useState<string | null>(localStorage.getItem('catreader_custom_wallpaper'));
  const [pageRatios, setPageRatios] = useState<number[]>([]);
  const [editingBook, setEditingBook] = useState<LibraryBook | null>(null);
  const [selectedTextMenu, setSelectedTextMenu] = useState<{ text: string; x: number; y: number } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [identifyingBookId, setIdentifyingBookId] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [dailyHighlight, setDailyHighlight] = useState<Highlight | null>(null);
  const [quadrant, setQuadrant] = useState<number>(1);

  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const APP_VERSION = 'v2.9.2';

  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const hasResumedRef = useRef(false);

  // --- Hooks Integration ---
  
  const {
    library, setLibrary,
    enrichedMetadata,
    enrichedMetadataRef,
    covers, setCovers,
    isLoadingLibrary,
    enrichmentProgress,
    fetchLibrary,
    updateBookMetadata,
    handleCoverUpload,
    fetchEnhancedCover,
    bulkMagic,
    enrichBookWithGemini,
    savedBookCovers,
    markCoverAsSaved
  } = useLibrary({
    showToast: (msg) => showToast(msg),
    setIsSyncing,
    setGlobalStatus,
    setGlobalError,
    setIdentifyingBookId,
    isSyncing
  });

  const {
    pageNumber, setPageNumber,
    zoom, setZoom,
    theme, setTheme,
    epubCfi, setEpubCfi,
    scrollRatio, setScrollRatio,
    isRestoring, setIsRestoring,
    getDeviceCategory,
    changeZoom,
    loadProgress,
    saveProgress
  } = useReaderSync({
    fileName,
    isLoaded,
    containerRef,
    showToast: (msg) => showToast(msg),
    setIsSyncing
  });

  const { googleToken, handleGoogleDrive, uploadToDrive } = useGoogleDrive({
    showToast: (msg) => showToast(msg),
    setIsSyncing,
    setFileUrl,
    setFileName,
    setFileType,
    setTextContent,
    setNumPages,
    setIsLoaded,
    loadProgress
  });

  const { shelves, updateShelfTitle, moveBook, reorderBook, consolidateShelves, addShelf, removeShelf } = useShelves(library);

  // Helper to get reading progress for Aura effect
  const getReadingProgress = useCallback((filename: string) => {
    // This is a bit complex since progress is stored per book in Firestore or locally
    // For the aura, we can check if we have any progress data in memory if it was recently loaded
    // Or we can just return 0 for now until we have a central progress store
    // Let's implement a simple version that checks if the current book matches
    if (fileName === filename) return pageNumber / (numPages || 1);
    
    // For others, we might need a cache of progress. 
    // Let's add a placeholder or simple logic for the demo.
    return 0; 
  }, [fileName, pageNumber, numPages]);

  // --- Persistence & Settings ---
  // Safety net: clamp pageNumber whenever numPages becomes known or changes
  useEffect(() => {
    if (numPages > 0 && pageNumber > numPages) {
      const clamped = clampPage(pageNumber, numPages);
      console.warn(`[Reader] pageNumber ${pageNumber} clamped to ${clamped}`);
      setPageNumber(clamped);
      setIsRestoring(false);
    }
  }, [numPages, pageNumber]);

  useEffect(() => {
    const loadSettings = async () => {
      const cloudSettings = await syncService.loadSettings();
      if (cloudSettings) {
        if (cloudSettings.wallpaper) {
          setWallpaper(cloudSettings.wallpaper);
          localStorage.setItem('catreader_wallpaper', cloudSettings.wallpaper);
        }
        if (cloudSettings.isSimplified !== undefined) {
          setIsSimplified(cloudSettings.isSimplified);
          localStorage.setItem('catreader_simplified', String(cloudSettings.isSimplified));
        }
        if (cloudSettings.customWallpaper) {
          setCustomWallpaper(cloudSettings.customWallpaper);
          localStorage.setItem('catreader_custom_wallpaper', cloudSettings.customWallpaper);
        }
      }
    };
    loadSettings();
  }, []);

  const handleSetWallpaper = useCallback((w: string) => {
    setWallpaper(w);
    localStorage.setItem('catreader_wallpaper', w);
    syncService.saveSettings({ wallpaper: w });
  }, []);

  const handleSetCustomWallpaper = useCallback((dataUrl: string) => {
    setCustomWallpaper(dataUrl);
    localStorage.setItem('catreader_custom_wallpaper', dataUrl);
    setWallpaper('custom');
    localStorage.setItem('catreader_wallpaper', 'custom');
    syncService.saveSettings({ customWallpaper: dataUrl, wallpaper: 'custom' });
  }, []);

  const handleToggleSimplified = useCallback(() => {
    setIsSimplified(prev => {
      const newVal = !prev;
      localStorage.setItem('catreader_simplified', String(newVal));
      syncService.saveSettings({ isSimplified: newVal });
      return newVal;
    });
  }, []);

  const handleToggleCoverLabels = useCallback(() => {
    setShowCoverLabels(prev => {
      const newVal = !prev;
      localStorage.setItem('catreader_cover_labels', String(newVal));
      return newVal;
    });
  }, []);

  // --- UI Lifecycle ---
  const uiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const resetUITimer = useCallback(() => {
    setShowUI(true);
    if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    uiTimeoutRef.current = setTimeout(() => {
      if (fileUrl) setShowUI(false);
    }, 4000);
  }, [fileUrl]);

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 2500);
  }, []);

  useEffect(() => {
    resetUITimer();

    const handleMouseMove = (e: MouseEvent) => {
      // If cursor is near the top edge (top 60px), force UI visibility and reset manual hide
      if (e.clientY < 60) {
        setShowUI(true);
        setIsManualHide(false);
        if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
      } else {
        resetUITimer();
      }
    };

    const handleTouchStart = () => {
      resetUITimer();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchStart);

    return () => {
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchStart);
    };
  }, [resetUITimer]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') setIsManualHide(prev => !prev);
      if (e.key.toLowerCase() === 'f') setIsFocusMode(prev => !prev);
      if (e.key.toLowerCase() === 'e') {
        const book = library.find(b => b.filename === fileName);
        if (book) setEditingBook(book);
      }
      if (e.key === 'Escape') {
        if (showDiagnostics) { setShowDiagnostics(false); return; }
        if (editingBook) { setEditingBook(null); return; }
        if (showMenu) { setShowMenu(false); return; }
        if (fileUrl) closeBook();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fileUrl, showDiagnostics, editingBook, showMenu]);

  // --- Persistence & Sync ---
  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;
  
  useEffect(() => {
    if (!isLoaded || !fileName || !containerRef.current) return;
    let inactivityTimer: ReturnType<typeof setTimeout>;
    let maxIntervalTimer: ReturnType<typeof setTimeout>;

    const scheduleSave = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => saveProgressRef.current(), 15000);
    };

    const handleScrollActivity = () => scheduleSave();
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') saveProgressRef.current();
    };
    const container = containerRef.current;
    container.addEventListener('scroll', handleScrollActivity, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);

    scheduleSave();
    maxIntervalTimer = setInterval(() => saveProgressRef.current(), 60000);

    return () => {
      container.removeEventListener('scroll', handleScrollActivity);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimeout(inactivityTimer);
      clearInterval(maxIntervalTimer);
    };
  }, [isLoaded, fileName]);

  // --- Auth Handlers ---
  const handleLogin = async (username: string, pin: string) => {
    setIsSyncing(true);
    await authService.login(username, pin);
    await fetchLibrary();
    showToast(`Bienvenido, ${username}`);
    setIsSyncing(false);
  };

  const handleLogout = () => {
    authService.logout();
    fetchLibrary();
    showToast('Sesión cerrada');
  };

  const handleGeneratePFP = async () => {
    const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || '';
    if (!g_apiKey || library.length === 0) return;
    setIsSyncing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: g_apiKey });
      const titles = library.slice(0, 5).map(b => b.title).join(', ');
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Create a unique, artistic, and minimalist SVG profile picture (circular design) that represents a reader of: ${titles}. Return ONLY the SVG code.` }] }]
      });
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleanSvg = responseText.substring(responseText.indexOf('<svg'), responseText.lastIndexOf('</svg>') + 6);
      authService.setPFP(cleanSvg);
      showToast('¡Avatar generado!');
    } catch (e) {
      console.error(e);
      showToast('Error al generar avatar');
    }
    setIsSyncing(false);
  };

  // --- Book Operations ---
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      setFileName(file.name);
      setFileType(ext);
      await coverDB.saveBookContent(file.name, file);
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      
      if (ext === 'txt') {
        const text = await file.text();
        setTextContent([text]);
        setNumPages(1);
        await coverDB.saveGhostText(file.name, text);
        await syncService.saveGhostText(file.name, text);
      } else if (ext === 'epub') {
        setTextContent(null);
      } else {
        setTextContent(null);
        extractGhostText(file, file.name);
      }

      await loadProgress(file.name);
      if (ext === 'txt' || ext === 'epub') setIsLoaded(true);
      else {
        setIsLoaded(false);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = setTimeout(() => setIsLoaded(true), 10000);
      }

      const isNew = !library.some(b => b.filename === file.name);
      if (isNew) {
        const newBook: LibraryBook = {
          id: file.name,
          filename: file.name,
          type: ext,
          title: file.name.replace(/\.[^/.]+$/, "")
        };
        setLibrary(prev => [newBook, ...prev]);

        // Stamp foundational metadata directly into IndexedDB for instant, indestructible offline resilience
        const foundationalMeta = {
          title: newBook.title,
          author: 'Desconocido',
          svg: ''
        };
        coverDB.saveBookMetadata(file.name, foundationalMeta).catch(dbErr => {
          console.error('[Upload] Failed to stamp foundational metadata:', dbErr);
        });

        const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || '';
        if (g_apiKey) {
          setTimeout(async () => {
            const enriched = await enrichBookWithGemini(newBook);
            if (enriched) {
              setLibrary(prev => prev.map(b => b.filename === file.name ? { ...b, ...enriched } : b));
              const currentMeta = enrichedMetadataRef.current[file.name] || {};
              const merged = { ...currentMeta, ...enriched };
              const newMeta = { ...enrichedMetadataRef.current, [file.name]: merged };
              localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMeta));
              try {
                await coverDB.saveBookMetadata(file.name, merged);
              } catch (dbErr) {}
              await syncService.saveMetadata(newMeta);
            }
          }, 1000);
        }
      }
      if (googleToken) await uploadToDrive(file, googleToken);
    }
  };

  const extractGhostText = async (fileOrBlob: File | Blob, filename: string) => {
    try {
      const existing = await coverDB.getGhostText(filename);
      if (existing) {
        loadGhostTextToState(existing);
        return;
      }
      const remote = await syncService.loadGhostText(filename);
      if (remote) {
        await coverDB.saveGhostText(filename, remote);
        loadGhostTextToState(remote);
        return;
      }
      console.log(`[Ghost] Progressive extraction started for: ${filename}`);
      extractGhostTextLazy(fileOrBlob, filename);
    } catch (err) {
      console.error('Ghost Text Extraction Error:', err);
    }
  };

  const extractGhostTextLazy = async (fileOrBlob: File | Blob, filename: string) => {
    try {
      console.log(`[Ghost] Lazy extraction for: ${filename}`);
      const data = new Uint8Array(await fileOrBlob.arrayBuffer());
      const loadingTask = (pdfjsBackground as any).getDocument({ data, useSystemFonts: true });
      const pdf = await loadingTask.promise;
      
      const totalPages = pdf.numPages;
      const pagesArray = new Array(totalPages).fill('');
      setTextContent(pagesArray);

      // Extract first 20 pages immediately for responsiveness
      const immediatePages = Math.min(20, totalPages);
      for (let i = 1; i <= immediatePages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        const pageHtml = await parsePdfPageSemantically(page, tc);
        pagesArray[i - 1] = pageHtml;
        setTextContent(prev => {
          const next = prev ? [...prev] : new Array(totalPages).fill('');
          next[i - 1] = pageHtml;
          return next;
        });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      console.log(`[Ghost] First ${immediatePages} pages extracted for: ${filename}`);

      // Continue remaining pages in background
      (async () => {
        for (let i = immediatePages + 1; i <= totalPages; i++) {
          try {
            const page = await pdf.getPage(i);
            const tc = await page.getTextContent();
            const pageHtml = await parsePdfPageSemantically(page, tc);
            pagesArray[i - 1] = pageHtml;
            setTextContent(prev => {
              if (!prev) return new Array(totalPages).fill('');
              const next = [...prev];
              next[i - 1] = pageHtml;
              return next;
            });
            await new Promise(resolve => setTimeout(resolve, 0));
          } catch (e) {
            console.warn(`[Ghost] Failed to extract page ${i}:`, e);
          }
        }
        try {
          const serialized = JSON.stringify(pagesArray);
          await coverDB.saveGhostText(filename, serialized);
          await syncService.saveGhostText(filename, serialized);
          console.log(`[Ghost] Full extraction complete for: ${filename}`);
        } catch (e) {
          console.error('[Ghost] Failed to cache extracted text:', e);
        }
      })();
    } catch (err) {
      console.error('[Ghost] Lazy extraction error:', err);
    }
  };

  const closeBook = (skipHistory = false) => {
    if (!fileUrl) return;
    // Flush progress before tearing down reader state
    if (isLoaded && fileName) {
      saveProgressRef.current?.();
    }
    restoreTargetPageRef.current = null;
    if (fileUrl.startsWith('blob:')) {
      URL.revokeObjectURL(fileUrl);
    }
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    if (restoringTimeoutRef.current) clearTimeout(restoringTimeoutRef.current);
    setFileUrl(null);
    setFileName('');
    setNumPages(0);
    setIsLoaded(false);
    setIsRestoring(false);
    setTextContent(null);
    setIsReaderMode(false);
    setQuadrant(1);
    setShowUI(true);
    setIsManualHide(false);
    localStorage.removeItem('catreader_last_book');
    if (!skipHistory) {
      if (window.history.state?.view === 'reader' && window.history.length > 1) {
        window.history.back();
      } else {
        window.history.replaceState({ view: 'library' }, '', libraryUrl());
      }
    }
  };

  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openFromLibrary = async (
    book: LibraryBook,
    forcePage?: number,
    forceQuadrant?: number,
    skipHistory = false
  ) => {
    const filename = book.filename;
    
    // If book is already open, just jump to page/quadrant if specified
    if (filename === fileName && fileUrl) {
      if (forcePage) scrollToPage(forcePage);
      return;
    }

    console.log(`[Reader] Opening book: ${filename}`);
    
    // Revoke previous URL if opening a different book
    if (fileUrl && fileUrl.startsWith('blob:')) {
      URL.revokeObjectURL(fileUrl);
    }

    setFileName(filename);
    setFileType(book.type);
    setIsReaderMode(false);
    restoreTargetPageRef.current = null;
    setPageNumber(1);
    setScrollRatio(0);
    
    // Clear previous timeouts
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    if (restoringTimeoutRef.current) clearTimeout(restoringTimeoutRef.current);
    const shelf = shelves.find(s => s.bookIds.includes(book.id));
    const shelfTitle = shelf?.title || 'library';
    const bookPath = buildBookPath(shelfTitle, filename, forcePage, forceQuadrant);
    localStorage.setItem('catreader_last_book', filename);

    const progressPromise = forcePage
      ? Promise.resolve(null)
      : loadProgress(filename);

    const blobPromise = (async (): Promise<Blob> => {
      const cached = await coverDB.getBookContent(filename);
      if (cached && cached.size > 0) {
        console.log(`[Reader] Using cached blob for ${filename}: ${cached.size} bytes, type=${cached.type}`);
        return cached;
      }
      if (cached && cached.size === 0) {
        console.warn(`[Reader] Cached blob for ${filename} is empty, refetching...`);
      }
      const baseUrl = import.meta.env.BASE_URL || '/';
      const booksDirPath = baseUrl.endsWith('/') ? `${baseUrl}books/` : `${baseUrl}/books/`;
      const fetchUrl = `${booksDirPath}${filename}`;
      console.log(`[Reader] Fetching blob from: ${fetchUrl}`);
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      console.log(`[Reader] Fetched blob for ${filename}: ${blob.size} bytes, type=${blob.type}`);
      if (blob.size === 0) throw new Error('Fetched blob is empty (0 bytes)');
      if (book.type === 'pdf' && !blob.type.includes('pdf')) {
        console.warn(`[Reader] Fetched blob has unexpected type for PDF: ${blob.type}. This may be an HTML fallback.`);
      }
      coverDB.saveBookContent(filename, blob).catch(() => {});
      return blob;
    })();

    try {
      const [blob, progress] = await Promise.all([blobPromise, progressPromise]);
      const url = URL.createObjectURL(blob);
      setFileUrl(url);

      if (skipHistory) {
        const onBookUrl = !!resolveBookRoute(window.location.pathname, window.location.search);
        if (!onBookUrl || window.history.length <= 1) {
          seedReaderHistoryStack(bookPath, filename);
        }
      } else {
        pushReaderHistory(bookPath, filename);
      }
      if (book.type === 'txt') {
        const text = await blob.text();
        setTextContent([text]);
        setNumPages(1);
        coverDB.saveGhostText(filename, text).catch(() => {});
        syncService.saveGhostText(filename, text).catch(() => {});
      } else if (book.type === 'epub') {
        setTextContent(null);
      } else {
        setTextContent(null);
      }

      if (forcePage) {
        restoreTargetPageRef.current = forcePage;
        setPageNumber(forcePage);
        setScrollRatio(0);
        if (forceQuadrant) setQuadrant(forceQuadrant);
      } else if (progress?.page && progress.page > 1) {
        restoreTargetPageRef.current = progress.page;
      } else {
        restoreTargetPageRef.current = null;
        setPageNumber(1);
        setScrollRatio(0);
      }
      
      // Safety timeout for the "Restoring position" overlay
      restoringTimeoutRef.current = setTimeout(() => setIsRestoring(false), 5000);
    } catch (err: any) {
      console.error('[Reader] Failed to open book:', err);
      setGlobalError({ message: 'No pudimos abrir el libro', details: err.message });
      showToast('Error al abrir el libro.');
    }
    if (book.type === 'txt' || book.type === 'epub') setIsLoaded(true);
    else {
      setIsLoaded(false);
      // Safety timeout for "Preparando páginas" (5s for heavy PDFs)
      loadingTimeoutRef.current = setTimeout(() => {
        console.warn('[Reader] Loading timeout reached for:', filename);
        setIsLoaded(true);
      }, 5000);
    }
  };

  // --- Browser Navigation ---
  useEffect(() => {
    const handlePopState = () => {
      const parsed = resolveBookRoute(window.location.pathname, window.location.search);
      if (parsed) {
        const book = matchBookBySlug(library, parsed.bookSlug, parsed.rawFilename);
        if (book) {
          openFromLibrary(book as LibraryBook, parsed.page, parsed.quadrant, true);
        }
      } else {
        closeBook(true);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [library]);

  useEffect(() => {
    if (editingBook) return;
    if (library.length > 0 && !fileUrl && !hasResumedRef.current) {
      hasResumedRef.current = true; // Mark as resumed immediately to prevent any subsequent auto-resumes
      const parsed = resolveBookRoute(window.location.pathname, window.location.search);
      if (parsed) {
        const book = matchBookBySlug(library, parsed.bookSlug, parsed.rawFilename);
        if (book) {
          openFromLibrary(book as LibraryBook, parsed.page, parsed.quadrant, true);
        }
      }
      // Land on gallery when no deep link — user picks a book
    }
  }, [library, fileUrl, editingBook]);

  useEffect(() => {
    const loadHighlights = async () => {
      const local = await coverDB.getHighlights();
      const remote = await syncService.loadHighlights();
      const merged = remote && remote.length > (local?.length || 0) ? remote : (local || []);
      setHighlights(merged);
      if (merged.length > 0) {
        const random = merged[Math.floor(Math.random() * merged.length)];
        setDailyHighlight(random);
      }
    };
    loadHighlights();
  }, []);

  useEffect(() => {
    if (fileName) {
      const book = library.find(b => b.filename === fileName);
      const shelf = book ? shelves.find(s => s.bookIds.includes(book.id)) : null;
      const shelfTitle = shelf?.title || 'library';
      const url = new URL(window.location.href);
      url.pathname = buildBookPath(shelfTitle, fileName, pageNumber, quadrant);
      url.search = '';
      window.history.replaceState(
        { view: 'reader', filename: fileName, ...(typeof window.history.state === 'object' ? window.history.state : {}) },
        '',
        url.toString()
      );
    }
  }, [pageNumber, quadrant, fileName, library, shelves]);

  useEffect(() => {
    if (fileType === 'txt' && isLoaded && scrollRatio > 0 && containerRef.current) {
      const { scrollHeight, clientHeight } = containerRef.current;
      containerRef.current.scrollTo({ top: scrollRatio * (scrollHeight - clientHeight), behavior: 'instant' });
      setScrollRatio(0);
    }
  }, [fileType, isLoaded, scrollRatio]);

  const scrollToPage = (targetPage: number) => {
    const prefix = isReaderMode ? 'text-page-' : 'page-';
    const el = document.getElementById(`${prefix}${targetPage}`);
    if (el && containerRef.current) {
      el.scrollIntoView({ behavior: 'smooth' });
      setPageNumber(targetPage);
    }
  };

  const changePage = (offset: number) => {
    const newPage = offsetPage(pageNumber, offset, numPages);
    if (newPage !== pageNumber) scrollToPage(newPage);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const width = window.innerWidth;
    if (e.clientX > width * 0.7) changePage(1);
    else if (e.clientX < width * 0.3) changePage(-1);
    resetUITimer();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !fileUrl) return;

    const observer = new IntersectionObserver((entries) => {
      if (isRestoring || restoreTargetPageRef.current !== null) return;
      let bestPage = pageNumber, bestRatio = -1;
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
          bestRatio = entry.intersectionRatio;
          bestPage = parseInt(entry.target.getAttribute('data-page') || '1');
        }
      });
      if (bestRatio >= 0) setPageNumber(bestPage);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1], root: container });

    const updateObserver = () => container.querySelectorAll('.page-wrapper, .text-page-wrapper').forEach((p) => observer.observe(p));
    const mutationObserver = new MutationObserver(updateObserver);
    mutationObserver.observe(container, { childList: true, subtree: true });
    updateObserver();

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [isLoaded, fileName, fileUrl, isRestoring]);

  const themeStyles = {
    light: 'bg-[#f8f9fa] text-stone-900',
    dim: 'bg-[#334155] text-[#cbd5e1]',
    dark: 'bg-[#121212] text-[#a3a3a3]',
    sepia: 'bg-[#e8dcc7] text-[#5c4b37]',
    paper: 'bg-[#f4ead5] text-[#4a3f35]'
  };

  const pdfFilter = {
    light: 'contrast(0.95)',
    dim: 'invert(0.8) hue-rotate(180deg) brightness(1.2) contrast(0.85)',
    dark: 'invert(1) hue-rotate(180deg) brightness(0.8) contrast(0.8)',
    sepia: 'sepia(0.4) contrast(0.9) brightness(0.9)',
    paper: 'sepia(0.2) contrast(1.1) brightness(0.95) saturate(1.1) drop-shadow(0 0 0px #f4ead5)'
  };

  return (
    <div className={cn("fixed inset-0 overflow-hidden flex flex-col transition-colors duration-500", themeStyles[theme])} onMouseMove={resetUITimer} onTouchStart={resetUITimer}>
      <button onClick={() => setShowDiagnostics(true)} className="fixed top-2 right-4 z-40 text-[10px] font-mono opacity-30 select-none hover:opacity-100 transition-opacity uppercase tracking-[0.2em] cursor-help">{APP_VERSION}</button>

      <AnimatePresence>{showDiagnostics && (

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-stone-950/95 backdrop-blur-xl p-6 sm:p-12 overflow-auto">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /><h2 className="text-xl font-mono text-white font-bold">CatReader Diagnostics</h2></div>
                <button onClick={() => setShowDiagnostics(false)} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-sm">
                <div className="bg-stone-900/50 p-4 rounded-xl border border-white/5">
                  <h3 className="text-stone-500 uppercase text-xs mb-3 font-bold">Core State</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Version</span><span className="text-emerald-400">{APP_VERSION}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Device</span><span className="text-amber-400 capitalize">{getDeviceCategory()}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Active Book</span><span className="text-indigo-400 truncate max-w-[200px]">{fileName || 'None'}</span></div>
                  </div>
                </div>
                <div className="bg-stone-900/50 p-4 rounded-xl border border-white/5">
                  <h3 className="text-stone-500 uppercase text-xs mb-3 font-bold">Metrics</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Page</span><span className="text-emerald-400">{pageNumber} / {numPages || 0}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Zoom</span><span className="text-white">{Math.round((typeof zoom === 'number' ? zoom : 1) * 100)}%</span></div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{globalStatus && (
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-amber-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-bold flex items-center gap-3 border-2 border-amber-400">
          <Loader2 className="animate-spin" size={20} /><span>{globalStatus}</span>
        </motion.div>
      )}</AnimatePresence>

      <AnimatePresence>{globalError && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="fixed inset-0 z-[200] bg-stone-950/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-red-900/20 border-2 border-red-500/50 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-500/20"><X className="text-white" size={32} /></div>
            <h2 className="text-2xl font-bold text-white mb-2">{globalError.message}</h2>
            <p className="text-red-200/70 text-sm mb-8 font-mono">{globalError.details || 'Error desconocido'}</p>
            <button onClick={() => { setGlobalError(null); window.location.reload(); }} className="w-full bg-white text-stone-950 font-bold py-4 rounded-xl hover:bg-stone-200 transition-colors shadow-lg">Recargar</button>
          </div>
        </motion.div>
      )}</AnimatePresence>

      <AnimatePresence>{showUI && !isManualHide && fileUrl && (
        <motion.header
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed left-0 right-0 z-50 flex items-center gap-2 bg-stone-950/90 text-stone-200 px-3 py-2 shadow-lg backdrop-blur-md border-b border-white/5"
          style={{
            top: 0,
            paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
          }}
        >
          <button
            onClick={() => closeBook()}
            className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-full hover:bg-white/10 text-amber-400 hover:text-amber-300 transition-colors"
            aria-label="Volver a la biblioteca"
          >
            <Library size={18} />
            <span className="text-[10px] font-bold uppercase tracking-wide hidden sm:inline">Biblioteca</span>
          </button>
          <div className="flex items-center gap-1 group/title cursor-pointer min-w-0 flex-1" onClick={() => {
            const book = library.find(b => b.filename === fileName);
            if (book) setEditingBook(book);
          }}>
            <span className="text-xs font-medium truncate text-stone-200 group-hover/title:text-white transition-colors">
              {(() => {
                const book = library.find(b => b.filename === fileName);
                return book ? displayBookTitle(book.title, book.filename) : fileName;
              })()}
            </span>
            <Pencil size={12} className="text-stone-500 group-hover/title:text-amber-400 transition-all opacity-0 group-hover/title:opacity-100 shrink-0 hidden sm:block" />
          </div>
          <div className="hidden sm:block w-px h-3 bg-white/10 mx-0.5 shrink-0" />
          <div className="hidden sm:flex items-center gap-0.5 shrink-0">
            {['light', 'sepia', 'paper', 'dim', 'dark'].map((t) => (
              <button key={t} onClick={() => setTheme(t as any)} className={cn("w-3 h-3 rounded-full border border-white/20 transition-all", theme === t ? "bg-indigo-500 ring-1 ring-white/40" : "bg-stone-700 hover:bg-stone-600")} title={t} />
            ))}
          </div>
          <div className="hidden md:block w-px h-3 bg-white/10 mx-0.5 shrink-0" />
          <div className="hidden md:flex items-center gap-0.5 shrink-0">
            <button onClick={() => changeZoom(-0.1)} className="p-1 hover:bg-white/10 rounded-full text-stone-400 hover:text-white"><ZoomOut size={12}/></button>
            <span className="text-[9px] font-mono w-7 text-center text-stone-400">{Math.round((typeof zoom === 'number' ? zoom : 1) * 100)}%</span>
            <button onClick={() => changeZoom(0.1)} className="p-1 hover:bg-white/10 rounded-full text-stone-400 hover:text-white"><ZoomIn size={12}/></button>
          </div>
          {(fileType === 'pdf' || fileType === 'txt') && (
            <>
              <div className="w-px h-3 bg-white/10 mx-0.5 shrink-0" />
              <button
                onClick={toggleReaderMode}
                className={cn(
                  "p-1.5 rounded-full transition-all shrink-0",
                  isReaderMode ? "bg-amber-500 text-white shadow-lg" : "text-stone-400 hover:text-white hover:bg-white/10"
                )}
                title="Modo lector (texto)"
                aria-label="Modo lector"
              >
                <BookText size={16} />
              </button>
            </>
          )}
          <div className="hidden lg:block w-px h-3 bg-white/10 mx-0.5 shrink-0" />
          <div className="hidden lg:flex items-center gap-1 shrink-0">
            <button onClick={() => setIsFocusMode(!isFocusMode)} className={cn("p-1 rounded-full transition-all", isFocusMode ? "bg-indigo-500 text-white shadow-lg" : "text-stone-400 hover:text-white hover:bg-white/10")} title="Focus (F)"><Maximize2 size={14} /></button>
            <button onClick={() => setIsCaptureMode(!isCaptureMode)} className={cn("p-1 rounded-full transition-all", isCaptureMode ? "bg-amber-500 text-white shadow-lg" : "text-stone-400 hover:text-white hover:bg-white/10")} title="Capture Cover"><Crop size={14} /></button>
          </div>
          <div className="w-px h-3 bg-white/10 mx-0.5 shrink-0" />
          <div className="relative shrink-0" ref={menuRef}>
            <button onClick={() => setShowMenu(!showMenu)} className={cn("p-1 hover:bg-white/10 rounded-full transition-colors", showMenu && "bg-white/10")} aria-label="More"><MoreVertical size={14} /></button>
            <AnimatePresence>{showMenu && (
              <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }} className="absolute top-full right-0 mt-2 bg-stone-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl py-1 min-w-[160px] z-[70]">
                <button onClick={() => { handleGoogleDrive(); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-white/10 flex items-center gap-2"><Cloud size={12} /> Google Drive</button>
                <button onClick={() => { 
                  const book = library.find(b => b.filename === fileName);
                  if (book) setEditingBook(book);
                  setShowMenu(false);
                }} className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-white/10 flex items-center gap-2">
                  <Pencil size={12} /> Editar Libro
                </button>
                <label className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-white/10 flex items-center gap-2 cursor-pointer"><Upload size={12} /> Subir PDF<input type="file" accept=".pdf,.txt,.epub" className="hidden" onChange={(e) => { onFileChange(e); setShowMenu(false); }} /></label>
                {(fileType === 'pdf' || fileType === 'txt') && (
                  <button onClick={() => { toggleReaderMode(); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-white/10 flex items-center gap-2 lg:hidden">
                    <BookText size={12} /> {isReaderMode ? 'Ver PDF' : 'Modo lector'}
                  </button>
                )}
                <button onClick={() => { navigator.clipboard.writeText(window.location.href); setShowMenu(false); showToast('Enlace copiado'); }} className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-white/10 flex items-center gap-2">🔗 Copiar enlace</button>
                <div className="border-t border-white/10 my-1 md:hidden" />
                <div className="px-3 py-2 md:hidden">
                  <p className="text-[9px] font-bold text-stone-500 uppercase tracking-widest mb-2">Tema</p>
                  <div className="flex items-center gap-1.5">
                    {['light', 'sepia', 'paper', 'dim', 'dark'].map((t) => (
                      <button key={t} onClick={() => setTheme(t as any)} className={cn("w-5 h-5 rounded-full border border-white/20", theme === t ? "bg-indigo-500 ring-1 ring-white/40" : "bg-stone-700")} title={t} />
                    ))}
                  </div>
                </div>
                <div className="px-3 py-2 flex items-center justify-between md:hidden">
                  <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest">Zoom</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => changeZoom(-0.1)} className="p-1.5 hover:bg-white/10 rounded-full text-stone-400"><ZoomOut size={14}/></button>
                    <span className="text-[10px] font-mono w-8 text-center text-stone-300">{Math.round((typeof zoom === 'number' ? zoom : 1) * 100)}%</span>
                    <button onClick={() => changeZoom(0.1)} className="p-1.5 hover:bg-white/10 rounded-full text-stone-400"><ZoomIn size={14}/></button>
                  </div>
                </div>
                <div className="border-t border-white/10 my-1" />
                <button onClick={() => { setShowDiagnostics(true); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-stone-500 hover:bg-white/10">Diagnostics</button>
                <button onClick={() => { setIsManualHide(true); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-stone-500 hover:bg-white/10">Ocultar UI (H)</button>
                <div className="border-t border-white/10 my-1 sm:hidden" />
                <button onClick={() => { closeBook(); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-amber-300 hover:bg-white/10 flex items-center gap-2 sm:hidden font-bold">
                  <Library size={12} /> Volver a biblioteca
                </button>
              </motion.div>
            )}</AnimatePresence>
          </div>
        </motion.header>
      )}</AnimatePresence>

      <div className="fixed bottom-2 left-4 z-40 flex items-center gap-2 text-[10px] font-mono select-none uppercase tracking-widest opacity-30">
        <div className={cn("w-1.5 h-1.5 rounded-full", isSyncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
        <span>{isSyncing ? 'Syncing' : 'Synced'}</span>
      </div>

      {fileUrl && (
        <div className="fixed bottom-0 left-0 right-0 h-[2px] bg-white/5 z-40">
          <div className="h-full bg-indigo-500/40 transition-all duration-500 ease-out" style={{ width: `${Math.max(0.5, (pageNumber / (numPages || 1)) * 100)}%` }} />
        </div>
      )}

      <main
        ref={containerRef}
        className="flex-1 overflow-auto scrollbar-none relative"
        onDoubleClick={handleDoubleClick}
        onClick={(e) => {
          if (!fileUrl) return;
          const target = e.target as HTMLElement;
          if (target.closest('button, a, input, textarea, [role="button"]')) return;
          setShowUI(true);
          setIsManualHide(false);
          resetUITimer();
        }}
      >
        {!fileUrl ? (
          <LibraryView 
            library={library} 
            covers={covers} 
            isLoading={isLoadingLibrary} 
            onOpenBook={(book) => openFromLibrary(book)} 
            onEditBook={setEditingBook} 
            onGoogleDrive={handleGoogleDrive} 
            onFileUpload={onFileChange} 
            isSimplified={isSimplified} 
            wallpaper={wallpaper} 
            customWallpaper={customWallpaper}
            onToggleSimplified={handleToggleSimplified} 
            onSetWallpaper={handleSetWallpaper} 
            onSetCustomWallpaper={handleSetCustomWallpaper}
            shelves={shelves} 
            onUpdateShelfTitle={updateShelfTitle} 
            onMoveBook={moveBook} 
            onReorderBook={reorderBook} 
            onConsolidate={consolidateShelves} 
            onMagicEnrich={bulkMagic} 
            onProfileClick={() => setShowProfile(true)} 
            onGetProgress={getReadingProgress}
            clearProgress={() => {}} 
            identifyingBookId={identifyingBookId} 
            isSyncing={isSyncing} 
            enrichmentProgress={enrichmentProgress} 
            savedBookCovers={savedBookCovers}
            onShareBook={(book) => { const shelf = shelves.find(s => s.bookIds.includes(book.id)); navigator.clipboard.writeText(buildBookShareUrl(shelf?.title || 'library', book.filename)); showToast('Enlace copiado'); }} dailyHighlight={dailyHighlight} onDismissHighlight={() => setDailyHighlight(null)} showCoverLabels={showCoverLabels} onToggleCoverLabels={handleToggleCoverLabels} onAddShelf={addShelf} onRemoveShelf={removeShelf} />
        ) : (
          <ReaderView 
            fileUrl={fileUrl} 
            fileType={fileType} 
            textContent={textContent} 
            numPages={numPages} 
            pageNumber={pageNumber} 
            zoom={typeof zoom === 'number' ? zoom : 1} 
            theme={theme} 
            scrollRatio={scrollRatio} 
            isRestoring={isRestoring} 
            isReaderMode={isReaderMode}
            paperPath={library.find(b => b.filename === fileName)?.paper ?? null}
            pageRatios={pageRatios} 
            onLoadSuccess={async (pdf) => {
              const fallback = 595 / 842;
              const ratios = Array(pdf.numPages).fill(fallback);
              try {
                setNumPages(pdf.numPages);
                const target = restoreTargetPageRef.current ?? pageNumber;
                const clampedPage = clampPage(target, pdf.numPages);
                if (clampedPage !== pageNumber) {
                  setPageNumber(clampedPage);
                }
                setPageRatios(ratios);
                // Show the reader immediately — page canvas fills in as PDF.js renders
                setIsLoaded(true);
              } catch (e) {
                console.error('[Reader] onLoadSuccess error:', e);
                setIsLoaded(true);
              }

              // Fill page ratios in background (layout placeholders only)
              (async () => {
                try {
                  const batchSize = 20;
                  for (let i = 0; i < pdf.numPages; i += batchSize) {
                    const batch: Promise<void>[] = [];
                    for (let j = i; j < Math.min(i + batchSize, pdf.numPages); j++) {
                      if (ratios[j] !== fallback) continue;
                      batch.push(
                        pdf.getPage(j + 1)
                          .then(p => {
                            const vp = p.getViewport({ scale: 1 });
                            ratios[j] = vp.width / vp.height;
                          })
                          .catch(() => {})
                      );
                    }
                    if (batch.length) await Promise.all(batch);
                  }
                  setPageRatios([...ratios]);
                } catch (e) {
                  console.error('Background ratio extraction failed:', e);
                }
              })();
            }} 
            onLoadError={(err) => {
              console.error('PDF Load Error:', err);
              setIsLoaded(true); // Dismiss overlay so error message in ReaderView is visible
              setIsRestoring(false); // Also clear restoring so overlay doesn't hang
              showToast('Error al cargar PDF');
            }}
            onPageRenderSuccess={(p) => {
              const targetPage = restoreTargetPageRef.current ?? pageNumber;
              if (p !== targetPage || !containerRef.current) return;
              const jump = () => {
                const el = document.getElementById(`page-${targetPage}`);
                if (el && containerRef.current) {
                  if (scrollRatio > 0) {
                    containerRef.current.scrollTo({
                      top: scrollRatio * (containerRef.current.scrollHeight - containerRef.current.clientHeight),
                      behavior: 'instant',
                    });
                  } else {
                    el.scrollIntoView({ behavior: 'instant' });
                    if (quadrant > 1) {
                      const offset = ((quadrant - 1) / 4) * el.clientHeight;
                      containerRef.current.scrollBy({ top: offset, behavior: 'instant' });
                    }
                  }
                  setScrollRatio(0);
                  restoreTargetPageRef.current = null;
                  setTimeout(() => setIsRestoring(false), 50);
                }
              };
              requestAnimationFrame(() => requestAnimationFrame(jump));
            }} 
            onPageRenderError={(_p, err) => {
              setRenderErrors((prev) => new Set(prev).add(_p));
              if (_p === pageNumber) setIsRestoring(false);
            }} 
            onTextSelection={(text, x, y) => setSelectedTextMenu({ text, x, y })} 
            onEpubLocationChange={setEpubCfi} 
            epubCfi={epubCfi} 
            themeStyles={themeStyles} 
            pdfFilter={pdfFilter} 
            isSimplified={isSimplified} 
            isFocusMode={isFocusMode}
            isCaptureMode={isCaptureMode}
            onToggleReaderMode={toggleReaderMode}
            onCapture={async (base64) => {
              console.log(`[Capture] onCapture triggered for ${fileName}`);
              setIsCaptureMode(false);
              showToast('Portada capturada, guardando...');
              try {
                console.log(`[Capture] Creating thumbnail...`);
                const { thumbnail, thumbHash } = await createThumbnail(base64);
                console.log(`[Capture] Thumbnail created, length=${thumbnail.length}`);
                await coverDB.saveCover(fileName, thumbnail);
                console.log(`[Capture] Saved to coverDB`);
                setCovers(prev => ({ ...prev, [fileName]: thumbnail }));
                console.log(`[Capture] Updated covers state`);
                markCoverAsSaved(fileName);
                showToast('Portada actualizada');

                // Upload to Firebase Storage in the background for cross-device sync
                setIsSyncing(true);
                try {
                  const downloadUrl = await syncService.uploadCoverBlob(fileName, thumbnail);
                  const coverSource = {
                    type: 'user-custom' as const,
                    url: downloadUrl || '',
                    thumbHash,
                    updatedAt: Date.now()
                  };
                  const currentMeta = enrichedMetadata[fileName] || { title: fileName.replace(/\.[^/.]+$/, ""), author: 'Desconocido' };
                  await updateBookMetadata(fileName, currentMeta.title, currentMeta.author, undefined, coverSource);
                  console.log(`[Capture] Metadata updated with coverSource`);
                } catch (syncErr) {
                  console.error('[Capture Sync] Failed to sync captured cover thumbnail to cloud:', syncErr);
                } finally {
                  setIsSyncing(false);
                }
              } catch (e) {
                console.error('[Capture] save error:', e);
                showToast('Error al guardar portada');
              }
            }}
          />
        )}
      </main>

      <AnimatePresence>{selectedTextMenu && (
        <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }} className="fixed z-[100] bg-stone-900/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1 flex gap-1 items-center" style={{ left: `${selectedTextMenu.x}px`, top: `${selectedTextMenu.y - 50}px`, transform: 'translateX(-50%)' }}>
          <button onClick={async () => { const book = library.find(b => b.filename === fileName); if (book) { await updateBookMetadata(fileName, selectedTextMenu.text, book.author || ''); showToast('Título actualizado'); } setSelectedTextMenu(null); }} className="px-2 py-1 text-[10px] font-bold uppercase text-white hover:bg-white/10 rounded-lg transition-colors">Set Title</button>
          <button onClick={async () => { const book = library.find(b => b.filename === fileName); if (book) { await updateBookMetadata(fileName, book.title, selectedTextMenu.text); showToast('Autor actualizado'); } setSelectedTextMenu(null); }} className="px-2 py-1 text-[10px] font-bold uppercase text-white hover:bg-white/10 rounded-lg transition-colors">Set Author</button>
          <button onClick={async () => { const book = library.find(b => b.filename === fileName); if (book) { setIsSyncing(true); const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || ''; if (g_apiKey) { try { const ai = new GoogleGenAI({ apiKey: g_apiKey }); const result = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: [{ role: 'user', parts: [{ text: `Generate a minimalist SVG book cover for "${book.title}" by "${book.author}". Return ONLY SVG.` }] }] }); const svg = result.candidates?.[0]?.content?.parts?.[0]?.text || ''; const cleanSvg = svg.substring(svg.indexOf('<svg'), svg.lastIndexOf('</svg>') + 6); await updateBookMetadata(fileName, book.title, book.author || '', cleanSvg); showToast('Portada generada'); } catch (e) {} } setIsSyncing(false); setSelectedTextMenu(null); } }} className="px-2 py-1 text-[10px] font-bold uppercase text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors">Magic Cover</button>
          <button onClick={async () => { const book = library.find(b => b.filename === fileName); if (book) { const newHighlight: Highlight = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, bookId: fileName, bookTitle: book.title, text: selectedTextMenu.text, page: pageNumber, createdAt: Date.now() }; const updated = [...highlights, newHighlight]; setHighlights(updated); await coverDB.saveHighlights(updated); await syncService.saveHighlights(updated); showToast('Cita guardada'); } setSelectedTextMenu(null); }} className="px-2 py-1 text-[10px] font-bold uppercase text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors">Save Quote</button>
          <button onClick={() => setSelectedTextMenu(null)} className="p-1 text-stone-500 hover:text-white transition-colors"><X size={14} /></button>
        </motion.div>
      )}</AnimatePresence>

      {fileUrl && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-stone-950/70 text-stone-300 px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm border border-white/5"
          style={{ bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))' }}
        >
          <button onClick={() => changePage(-1)} disabled={pageNumber <= 1} className="disabled:opacity-10 hover:text-white transition-colors p-0.5"><ChevronLeft size={16}/></button>
          <PageInput pageNumber={pageNumber} numPages={numPages} onGoToPage={scrollToPage} />
          <button onClick={() => changePage(1)} disabled={pageNumber >= numPages} className="disabled:opacity-10 hover:text-white transition-colors p-0.5"><ChevronRight size={16}/></button>
          {isSyncing && <Loader2 size={10} className="animate-spin absolute -right-5 text-indigo-400" />}
        </div>
      )}

      <AnimatePresence>{toast.visible && (<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-stone-900/90 backdrop-blur-md text-white text-xs font-medium px-4 py-2 rounded-full shadow-xl border border-white/10">{toast.message}</motion.div>)}</AnimatePresence>

      <EditModal book={editingBook} onClose={() => setEditingBook(null)} onSave={async (title, author) => { if (editingBook) { await updateBookMetadata(editingBook.filename, title, author); setEditingBook(null); } }} onUploadCover={(file) => { if (editingBook) handleCoverUpload(editingBook.filename, file); }} onRegenerateCover={async (title, author, forceAI) => { if (editingBook) { setIsSyncing(true); await fetchEnhancedCover({ ...editingBook, title, author }, forceAI); setIsSyncing(false); } }} onPasteError={(msg) => showToast(msg)} isSyncing={isSyncing} />
      <ProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} onLogin={handleLogin} onLogout={handleLogout} onGeneratePFP={handleGeneratePFP} isSyncing={isSyncing} />
    </div>
  );
}
