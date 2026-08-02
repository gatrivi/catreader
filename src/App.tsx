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
  BookText,
  Headphones,
  CassetteTape
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
import { AudiobookListenPanel } from './components/AudiobookListenPanel';
import { useShelves } from './hooks/useShelves';
import { useGoogleDrive } from './hooks/useGoogleDrive';
import { useReaderSync } from './hooks/useReaderSync';
import { useLibrary, LibraryBook } from './hooks/useLibrary';

import { ProfileModal } from './components/ProfileModal';
import { authService } from './services/authService';
import { buildBookPath, parseBookPath, matchBookBySlug, getLibraryPath, getFeedPath, isFeedPath, resolveBookRoute, buildBookShareUrl } from './utils/routing';
import { displayBookTitle } from './components/BookCover';
import { ReadingFeedView } from './components/ReadingFeedView';
import { FragmentReportsModal } from './components/FragmentReportsModal';
import type { ReadingFeedItem } from './utils/readingFeed';
import { loadFragmentReports } from './utils/fragmentReports';
import { clampPage, offsetPage, shouldBlockPageObserver, pageElementPrefix } from './utils/reader';
import { PageInput } from './components/PageInput';
import { parsePdfPageSemantically } from './utils/pdfParser';
import { createThumbnail } from './utils/image';
import { sentencesFromPageHtml } from './utils/sentences';
import { useLiveAudio } from './hooks/useLiveAudio';
import { usePwaUpdate } from './hooks/usePwaUpdate';
import { detectBookLang } from './utils/bookLang';
import {
  pagesNeededAround,
  incompleteGhostPages,
  emptyGhostPages,
  applyGhostPages,
  firstWordHtml,
  snippetHtml,
  yieldToUi,
  GHOST_PREFETCH,
  isGhostComplete,
} from './utils/ghostText';
import { loadLocalProgressMap } from './utils/localProgress';
import { ReleaseNotesModal } from './components/ReleaseNotesModal';
import { APP_VERSION, RELEASE_NOTES_SEEN_KEY } from './utils/releaseNotes';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function libraryUrl(): string {
  return new URL(getLibraryPath(), window.location.origin).toString();
}

function feedUrl(): string {
  return new URL(getFeedPath(), window.location.origin).toString();
}

/** Ensure browser Back returns to the gallery instead of leaving the site. */
function seedReaderHistoryStack(bookPath: string, filename: string) {
  const bookUrl = new URL(bookPath, window.location.origin).toString();
  const fromFeed = isFeedPath(window.location.pathname);
  window.history.replaceState(
    { view: fromFeed ? 'feed' : 'library', direct: true },
    '',
    fromFeed ? feedUrl() : libraryUrl()
  );
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
 * v2.10.15
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
  const [isFeedView, setIsFeedView] = useState(() => isFeedPath(window.location.pathname));
  const [showCoverLabels, setShowCoverLabels] = useState(localStorage.getItem('catreader_cover_labels') === 'true');
  const restoringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreTargetPageRef = useRef<number | null>(null);
  const modeSwitchPageRef = useRef<number | null>(null);
  
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
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [releaseNotesUnread, setReleaseNotesUnread] = useState(
    () => localStorage.getItem(RELEASE_NOTES_SEEN_KEY) !== 'true',
  );
  const pwaUpdate = usePwaUpdate();

  useEffect(() => {
    if (releaseNotesUnread) setShowReleaseNotes(true);
  }, [releaseNotesUnread]);

  const closeReleaseNotes = useCallback(() => {
    localStorage.setItem(RELEASE_NOTES_SEEN_KEY, 'true');
    setReleaseNotesUnread(false);
    setShowReleaseNotes(false);
  }, []);
  const [showFragmentReports, setShowFragmentReports] = useState(false);
  const [fragmentReportCount, setFragmentReportCount] = useState(() => loadFragmentReports().length);

  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const hasResumedRef = useRef(false);
  const textContentRef = useRef(textContent);
  textContentRef.current = textContent;
  const ghostPdfRef = useRef<{ filename: string; pdf: any } | null>(null);
  const ghostPdfLoadingRef = useRef<Promise<any> | null>(null);
  const ghostInflightRef = useRef<Set<number>>(new Set());
  const ghostPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookBlobPromisesRef = useRef<Map<string, Promise<Blob>>>(new Map());
  const openRequestRef = useRef(0);

  // --- Hooks Integration ---
  const liveLang = detectBookLang(fileName);
  const liveAudio = useLiveAudio(liveLang);
  const [showAudiobook, setShowAudiobook] = useState(false);
  const prevFileForLiveRef = useRef(fileName);

  // Stop live TTS only when switching books (not on first open / HMR noise)
  useEffect(() => {
    const prev = prevFileForLiveRef.current;
    prevFileForLiveRef.current = fileName;
    if (prev && fileName && prev !== fileName) liveAudio.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]);

  const {
    library, setLibrary,
    enrichedMetadata,
    enrichedMetadataRef,
    covers, setCovers,
    coversHydrated,
    isLoadingLibrary,
    enrichmentProgress,
    fetchLibrary,
    updateBookMetadata,
    handleCoverUpload,
    fetchEnhancedCover,
    bulkMagic,
    enrichWithOpenLibrary,
    enrichBookWithGemini,
    savedBookCovers,
    markCoverAsSaved,
    removeBook,
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
    saveProgress,
    commitPage,
    resetCommittedPage,
  } = useReaderSync({
    fileName,
    isLoaded,
    containerRef,
    showToast: (msg) => showToast(msg),
    setIsSyncing,
    getRestoreTargetPage: () => restoreTargetPageRef.current,
  });

  const pageNumberRef = useRef(pageNumber);
  pageNumberRef.current = pageNumber;
  const isReaderModeRef = useRef(isReaderMode);
  isReaderModeRef.current = isReaderMode;

  /** Freeze page across any DOM remount that would confuse IntersectionObserver. */
  const freezePageForRemount = useCallback((keep = pageNumberRef.current) => {
    if (keep < 1) return;
    modeSwitchPageRef.current = keep;
    restoreTargetPageRef.current = keep;
    setIsRestoring(true);
  }, [setIsRestoring]);

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

  // Cover aura: localStorage progress map (no cloud fan-out)
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const refreshProgressMap = useCallback(() => {
    setProgressMap(loadLocalProgressMap());
  }, []);
  useEffect(() => {
    refreshProgressMap();
  }, [library, refreshProgressMap]);

  const getReadingProgress = useCallback((filename: string) => {
    if (fileName === filename && numPages > 0) return pageNumber / numPages;
    return progressMap[filename] ?? 0;
  }, [fileName, pageNumber, numPages, progressMap]);

  // --- Persistence & Settings ---
  // Safety net: clamp pageNumber whenever numPages becomes known or changes
  useEffect(() => {
    if (numPages > 0 && pageNumber > numPages) {
      const clamped = clampPage(pageNumber, numPages);
      console.warn(`[Reader] pageNumber ${pageNumber} clamped to ${clamped}`);
      setPageNumber(clamped);
      // do not clear isRestoring â€” FEATURE #1 freeze must survive clamp
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
    if (liveAudio.error) showToast(liveAudio.error);
  }, [liveAudio.error, showToast]);

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
  const saveProgressAndAura = useCallback(async (opts?: { force?: boolean; pageOverride?: number }) => {
    await saveProgress(opts);
    refreshProgressMap();
  }, [saveProgress, refreshProgressMap]);
  const saveProgressRef = useRef(saveProgressAndAura);
  saveProgressRef.current = saveProgressAndAura;
  
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
    showToast('SesiÃ³n cerrada');
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
        contents: [{ role: 'user', parts: [{ text: `Create a unique, artistic, and mi…10454 tokens truncated…w-2xl py-1 min-w-[160px] z-[70]">
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
                <button onClick={() => { navigator.clipboard.writeText(window.location.href); setShowMenu(false); showToast('Enlace copiado'); }} className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-white/10 flex items-center gap-2">ðŸ”— Copiar enlace</button>
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
                    <button onClick={() => { freezePageForRemount(); changeZoom(-0.1); }} className="p-1.5 hover:bg-white/10 rounded-full text-stone-400"><ZoomOut size={14}/></button>
                    <span className="text-[10px] font-mono w-8 text-center text-stone-300">{Math.round((typeof zoom === 'number' ? zoom : 1) * 100)}%</span>
                    <button onClick={() => { freezePageForRemount(); changeZoom(0.1); }} className="p-1.5 hover:bg-white/10 rounded-full text-stone-400"><ZoomIn size={14}/></button>
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
          isFeedView ? (
            <ReadingFeedView
              library={library}
              onOpenItem={openFeedItem}
              onWarmBook={warmBook}
              onBack={closeFeed}
              appVersion={APP_VERSION}
              onReportSaved={() => setFragmentReportCount(loadFragmentReports().length)}
            />
          ) : (
          <LibraryView 
            library={library} 
            covers={covers} 
            coversHydrated={coversHydrated}
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
            onOpenLibraryEnrich={enrichWithOpenLibrary}
            onProfileClick={() => setShowProfile(true)} 
            onGetProgress={getReadingProgress}
            identifyingBookId={identifyingBookId} 
            isSyncing={isSyncing} 
            enrichmentProgress={enrichmentProgress} 
            savedBookCovers={savedBookCovers}
            pwaUpdate={{ status: pwaUpdate.status, onCheckForUpdate: pwaUpdate.checkForUpdate }}
            releaseNotesVersion={APP_VERSION}
            releaseNotesUnread={releaseNotesUnread}
            onOpenReleaseNotes={() => setShowReleaseNotes(true)}
            onOpenFeed={openFeed}
            onOpenReports={() => setShowFragmentReports(true)}
            fragmentReportCount={fragmentReportCount}
            onShareBook={(book) => { const shelf = shelves.find(s => s.bookIds.includes(book.id)); navigator.clipboard.writeText(buildBookShareUrl(shelf?.title || 'library', book.filename)); showToast('Enlace copiado'); }} dailyHighlight={dailyHighlight} onDismissHighlight={() => setDailyHighlight(null)} showCoverLabels={showCoverLabels} onToggleCoverLabels={handleToggleCoverLabels} onAddShelf={addShelf} onRemoveShelf={(id) => {
              const result = removeShelf(id);
              if (result && result.count > 0) {
                showToast(`${result.count} libro${result.count === 1 ? '' : 's'} movidos`);
              }
              return result;
            }} />
          )
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
                // Show the reader immediately â€” page canvas fills in as PDF.js renders
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
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          onMouseDown={(e) => e.preventDefault()}
          className="fixed z-[100] bg-stone-900/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1 flex gap-1 items-center"
          style={{ left: `${selectedTextMenu.x}px`, top: `${selectedTextMenu.y - 50}px`, transform: 'translateX(-50%)' }}
        >
          <button
            onClick={async () => {
              const book = library.find(b => b.filename === fileName);
              if (book) {
                const newHighlight: Highlight = {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  bookId: fileName,
                  bookTitle: book.title,
                  text: selectedTextMenu.text,
                  page: pageNumber,
                  createdAt: Date.now(),
                };
                const updated = [...highlights, newHighlight];
                setHighlights(updated);
                await coverDB.saveHighlights(updated);
                await syncService.saveHighlights(updated);
                showToast('Cita guardada');
              }
              window.getSelection()?.removeAllRanges();
              setSelectedTextMenu(null);
            }}
            className="px-2 py-1 text-[10px] font-bold uppercase text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
          >
            Guardar cita
          </button>
          <button
            onClick={() => {
              window.getSelection()?.removeAllRanges();
              setSelectedTextMenu(null);
            }}
            className="p-1 text-stone-500 hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
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

      {showAudiobook && (() => {
        const ab = library.find(b => b.filename === fileName);
        if (!ab?.cattsBookId) return null;
        return (
          <AudiobookListenPanel
            cattsBookId={ab.cattsBookId}
            title={displayBookTitle(ab.title, ab.filename)}
            onClose={() => setShowAudiobook(false)}
          />
        );
      })()}

      <AnimatePresence>{toast.visible && (<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-stone-900/90 backdrop-blur-md text-white text-xs font-medium px-4 py-2 rounded-full shadow-xl border border-white/10">{toast.message}</motion.div>)}</AnimatePresence>

      <EditModal
        book={editingBook}
        onClose={() => setEditingBook(null)}
        onSave={async (title, author) => {
          if (editingBook) {
            await updateBookMetadata(editingBook.filename, title, author);
            setEditingBook(null);
          }
        }}
        onUploadCover={(file) => {
          if (editingBook) handleCoverUpload(editingBook.filename, file);
        }}
        onRegenerateCover={async (title, author, forceAI) => {
          if (editingBook) {
            setIsSyncing(true);
            await fetchEnhancedCover({ ...editingBook, title, author }, forceAI);
            setIsSyncing(false);
          }
        }}
        onDelete={async () => {
          if (!editingBook) return;
          const fn = editingBook.filename;
          const wasOpen = fileName === fn;
          setEditingBook(null);
          if (wasOpen) closeBook(true);
          await removeBook(fn);
        }}
        onPasteError={(msg) => showToast(msg)}
        isSyncing={isSyncing}
      />
      <ProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} onLogin={handleLogin} onLogout={handleLogout} onGeneratePFP={handleGeneratePFP} isSyncing={isSyncing} />
      <ReleaseNotesModal isOpen={showReleaseNotes} onClose={closeReleaseNotes} />
      <FragmentReportsModal isOpen={showFragmentReports} onClose={() => setShowFragmentReports(false)} />
    </div>
  );
}

