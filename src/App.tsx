/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AGENT NOTE: This file is ~1,300 lines. It's a monolith.
 * Before adding major features, extract logic into hooks (see useShelves.ts as pattern).
 * Key regions: Google Drive (L140), Library loading (L330), Progress sync (L640),
 * Reader UI overlays (L1090), Render return (L1008).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs as pdfjsLib } from 'react-pdf';
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
  X,
  Cloud,
  MoreVertical,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { syncService, ReadingProgress } from './services/syncService';
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
import { BookCover } from './components/BookCover';
import { useShelves } from './hooks/useShelves';

import { ProfileModal } from './components/ProfileModal';
import { authService } from './services/authService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// PDF.js worker setup
// (Removed redundant setup to avoid collision)

declare var google: any;
declare var gapi: any;

// Google Drive Config
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || 'AIzaSyBvydI7C1p9ErqnIoY4VqFrM9TeBESTWLg';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

type Theme = 'light' | 'dim' | 'dark' | 'sepia';

interface LibraryBook {
  id: string;
  title: string;
  author?: string;
  filename: string;
  type: string;
  svg?: string;
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
  const [scrollRatio, setScrollRatio] = useState<number>(0);
  const [showUI, setShowUI] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [library, setLibrary] = useState<LibraryBook[]>([]);
  const [enrichedMetadata, setEnrichedMetadata] = useState<Record<string, { title: string; author: string; svg?: string }>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [bufferedPages, setBufferedPages] = useState<Set<number>>(new Set());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [renderErrors, setRenderErrors] = useState<Set<number>>(new Set());
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [direction, setDirection] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const [autoCoverIndex, setAutoCoverIndex] = useState(0);
  const [coverScanKey, setCoverScanKey] = useState(0);
  const [isManualHide, setIsManualHide] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('catreader_theme') || 'dim');
  const [zoom, setZoom] = useState<number | Record<string, number>>(1.0);
  const [isSimplified, setIsSimplified] = useState(localStorage.getItem('catreader_simplified') === 'true');
  const [wallpaper, setWallpaper] = useState(localStorage.getItem('catreader_wallpaper') || 'wood');
  const [pageRatios, setPageRatios] = useState<number[]>([]);
  const [extractingRatios, setExtractingRatios] = useState(false);
  const [editingBook, setEditingBook] = useState<LibraryBook | null>(null);
  const [selectedTextMenu, setSelectedTextMenu] = useState<{ text: string; x: number; y: number } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [identifyingBookId, setIdentifyingBookId] = useState<string | null>(null);
  const [enrichmentProgress, setEnrichmentProgress] = useState<{ current: number; total: number; filename?: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const APP_VERSION = 'v2.3.0';

  const handleLogin = async (username: string, pin: string) => {
    setIsSyncing(true);
    await authService.login(username, pin);
    await fetchLibrary(); // Refresh for new user context
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
        model: "gemini-1.5-flash",
        contents: [{ role: 'user', parts: [{ text: `Create a unique, artistic, and minimalist SVG profile picture (circular design) that represents a reader of: ${titles}. 
        Focus on abstract shapes, books, and wisdom. Use a warm color palette. 
        Ensure it fits within a circular viewBox="0 0 100 100".
        Return ONLY the SVG code.` }] }]
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

  const { shelves, updateShelfTitle, moveBook, reorderBook } = useShelves(library);
  
  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gapiLoaded = useRef(false);
  const gisLoaded = useRef(false);
  const lastScrollTime = useRef(0);
  const wheelAccumulator = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);

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
      showToast('Las librerías de Google aún se están cargando. Por favor, espera un momento.');
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
              // Check cache first
              const cached = await coverDB.getBookContent(fileName);
              let blob: Blob;
              
              if (cached) {
                console.log('Loading from cache:', fileName);
                blob = cached;
              } else {
                console.log('Fetching from Drive:', fileName);
                const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                blob = await response.blob();
                // Save to cache
                await coverDB.saveBookContent(fileName, blob);
              }

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
              showToast('Error al descargar el archivo de Google Drive.');
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

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 2500);
  }, []);

  useEffect(() => {
    resetUITimer();
    return () => { if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current); };
  }, [resetUITimer]);

  // Close More Menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  /**
   * Identifies the device category based on screen width.
   * Mobile < 768px, Tablet < 1024px, Desktop >= 1024px
   */
  const getDeviceCategory = useCallback(() => {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }, []);

  /**
   * Keyboard shortcuts for better UX.
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') {
        setIsManualHide(prev => !prev);
      }
      if (e.key.toLowerCase() === 'f') {
        setIsFocusMode(prev => !prev);
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

  /**
   * Fetches the list of available books from the statically generated books.json.
   * This file is generated during the build process or via the predev script.
   */
  const fetchLibrary = useCallback(async () => {
    setIsLoadingLibrary(true);
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const booksJsonPath = baseUrl.endsWith('/') ? `${baseUrl}books.json` : `${baseUrl}/books.json`;
      
      console.log(`[Library] Fetching from: ${booksJsonPath} (Base: ${baseUrl})`);
      const res = await fetch(booksJsonPath);
      
      if (!res.ok) {
        console.error(`[Library] Fetch failed with status ${res.status}: ${res.statusText}`);
        throw new Error(`books.json not found (${res.status})`);
      }
      
      const contentType = res.headers.get('content-type');
      console.log(`[Library] Response Content-Type: ${contentType}`);
      
      if (contentType && !contentType.includes('application/json')) {
        const text = await res.text();
        console.error(`[Library] Received non-JSON response (first 100 chars): ${text.substring(0, 100)}`);
        throw new Error(`Expected JSON but got ${contentType}. The file might be missing, and the server returned index.html instead.`);
      }

      const data = await res.json();
      
      // SET LIBRARY IMMEDIATELY - Don't wait for cloud metadata
      setLibrary(data);
      setIsLoadingLibrary(false);

      // Load enriched metadata in the background
      (async () => {
        try {
          let metadata: Record<string, { title: string; author: string }> = {};
          const cloudMetadata = await syncService.loadMetadata();
          const localStored = localStorage.getItem('catreader_enriched_metadata');
          
          if (cloudMetadata) {
            metadata = cloudMetadata;
          } else if (localStored) {
            metadata = JSON.parse(localStored);
          }
          
          if (Object.keys(metadata).length > 0) {
            setEnrichedMetadata(metadata);
            localStorage.setItem('catreader_enriched_metadata', JSON.stringify(metadata));
            
            const enriched = data.map((book: LibraryBook) => ({
              ...book,
              title: metadata[book.filename]?.title || book.title,
              author: metadata[book.filename]?.author || ''
            }));
            setLibrary(enriched);
          }
        } catch (mErr) {
          console.warn('Metadata enrichment skipped:', mErr);
        }
      })();

      // Load covers from IndexedDB
      const loadedCovers: Record<string, string> = {};
      for (const book of data) {
        const cover = await coverDB.getCover(book.filename);
        if (cover) loadedCovers[book.filename] = cover;
      }
      setCovers(loadedCovers);
      
    } catch (err) {
      console.error('Failed to fetch library:', err);
      setIsLoadingLibrary(false);
    }
  }, []);

  /**
   * Extracts the first few pages of a PDF as base64 images for OCR.
   */
  const extractPagesAsImages = async (blob: Blob, maxPages = 5): Promise<string[]> => {
    try {
      const data = new Uint8Array(await blob.arrayBuffer());
      const loadingTask = (pdfjsBackground as any).getDocument({ data, useSystemFonts: true });
      const pdf = await loadingTask.promise;
      const images: string[] = [];
      
      const pagesToScan = Math.min(pdf.numPages, maxPages);
      for (let i = 1; i <= pagesToScan; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // Good balance for OCR
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]); // Only base64 part
      }
      return images;
    } catch (err) {
      console.error('Error extracting pages for OCR:', err);
      return [];
    }
  };

  /**
   * Enriches a single book using Gemini LLM magic.
   * Uses OCR for PDFs to handle "Google scan" noise and cryptic filenames.
   */
  const enrichBookWithGemini = async (book: LibraryBook) => {
    const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || '';
    if (!g_apiKey) return null;

    setIdentifyingBookId(book.id);
    try {
      const ai = new GoogleGenAI({ apiKey: g_apiKey });
      
      let prompt = `Analyze this book file named "${book.filename}".
      1. Identify the actual Book Title and Author Name.
      2. If you see introductory pages (e.g., Google Books "digitized by Google" pages, library stamps, or legal notices), IGNORE THEM and find the real title page further in.
      3. Create a beautiful, minimalist book cover in SVG format.
         - Use a color palette that matches the book's theme.
         - Include a thin, subtle border (1px) around the entire cover.
         - Include the TITLE (large, bold, centered) and AUTHOR (smaller, centered) in the SVG.
         - Ensure text is high contrast and readable against the background.
         - Vertical 2:3 ratio (viewBox="0 0 400 600").
      
      Return ONLY a JSON object:
      {
        "title": "Clean Title",
        "author": "Author Name",
        "svg": "<svg ...>...</svg>"
      }`;

      const parts: any[] = [{ text: prompt }];
      
      // For PDFs, try to get visual context
      if (book.type === 'pdf') {
        const blob = await coverDB.getBookContent(book.filename);
        if (blob) {
          const images = await extractPagesAsImages(blob, 5);
          images.forEach(b64 => {
            parts.push({
              inlineData: { data: b64, mimeType: "image/jpeg" }
            });
          });
        }
      }

      const result = await (ai as any).models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: 'user', parts }]
      });
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      const enriched = JSON.parse(cleanJson);
      
      if (enriched && enriched.title) {
        return {
          title: enriched.title,
          author: enriched.author || 'Unknown',
          svg: enriched.svg
        };
      }
    } catch (err) {
      console.error(`Gemini Enrichment Error (${book.filename}):`, err);
    } finally {
      setIdentifyingBookId(null);
    }
    return null;
  };

  /**
   * Enriches the library using Gemini LLM magic.
   * Forces a re-scan of all books even if already enriched.
   */
  const magicFixLibrary = async () => {
    if (library.length === 0) return;
    setIsSyncing(true);
    showToast('Enriqueciendo biblioteca...');
    
    try {
      const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || '';
      if (!g_apiKey) {
        showToast('Gemini API Key not found. Please set VITE_GEMINI_API_KEY in .env');
        return;
      }
      
      const newMetadata = { ...enrichedMetadata };
      let updatedCount = 0;

      setEnrichmentProgress({ current: 0, total: library.length, filename: 'Iniciando...' });

      for (let i = 0; i < library.length; i++) {
        const book = library[i];
        setEnrichmentProgress({ current: i + 1, total: library.length, filename: book.title });
        
        // Add a safety timeout for the Gemini call
        const enrichPromise = enrichBookWithGemini(book);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000));
        
        try {
          const enriched = await Promise.race([enrichPromise, timeoutPromise]) as any;
          if (enriched) {
            newMetadata[book.filename] = enriched;
            updatedCount++;
            
            if (enriched.svg) {
              await coverDB.saveCover(book.filename, enriched.svg);
              setCovers(prev => ({ ...prev, [book.filename]: enriched.svg }));
            }
          }
        } catch (e) {
          console.warn(`Skipping ${book.filename} due to error or timeout:`, e);
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      }

      setEnrichmentProgress(null);

      setEnrichedMetadata(newMetadata);
      localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
      await syncService.saveMetadata(newMetadata);
      
      // Update current library state
      setLibrary(prev => prev.map(book => ({
        ...book,
        title: newMetadata[book.filename]?.title || book.title,
        author: newMetadata[book.filename]?.author || book.author,
        svg: newMetadata[book.filename]?.svg
      })));
      
      showToast(`Biblioteca enriquecida: ${updatedCount} libros procesados`);
    } catch (err) {
      console.error('Magic Fix Error:', err);
      showToast('Error al enriquecer la biblioteca');
    } finally {
      setIsSyncing(false);
      setIdentifyingBookId(null);
    }
  };

  /**
   * Tries multiple FREE APIs for book covers:
   * 1. Google Books API (free, no key)
   * 2. Open Library Covers API (free, no key)
   * 3. Pollinations.ai (free AI image gen, no key)
   * 4. Gradient fallback
   */
  const fetchEnhancedCover = async (book: LibraryBook) => {
    setIdentifyingBookId(book.id);
    try {
      const searchTitle = book.title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      
      // 0. Try Gemini SVG first if we have metadata
      if (enrichedMetadataRef.current[book.filename]?.svg) {
        const svg = enrichedMetadataRef.current[book.filename].svg as string;
        await coverDB.saveCover(book.filename, svg);
        setCovers(prev => ({ ...prev, [book.filename]: svg }));
        return;
      }

      // 1. Try Google Books API first
      const query = encodeURIComponent(`intitle:${searchTitle}${book.author ? ` inauthor:${book.author}` : ''}`);
      const gBooksRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
      const gBooksData = await gBooksRes.json();
      
      const thumbnail = gBooksData.items?.[0]?.volumeInfo?.imageLinks?.thumbnail || 
                        gBooksData.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
      
      if (thumbnail) {
        const secureThumbnail = thumbnail.replace('http://', 'https://');
        await coverDB.saveCover(book.filename, secureThumbnail);
        setCovers(prev => ({ ...prev, [book.filename]: secureThumbnail }));
        return;
      }

      // 2. Try Open Library Covers API (completely free, no key needed)
      try {
        const olQuery = encodeURIComponent(`${searchTitle} ${book.author || ''}`.trim());
        const olRes = await fetch(`https://openlibrary.org/search.json?q=${olQuery}&limit=1`);
        const olData = await olRes.json();
        const olCoverId = olData.docs?.[0]?.cover_i;
        if (olCoverId) {
          const olCoverUrl = `https://covers.openlibrary.org/b/id/${olCoverId}-L.jpg`;
          await coverDB.saveCover(book.filename, olCoverUrl);
          setCovers(prev => ({ ...prev, [book.filename]: olCoverUrl }));
          return;
        }
      } catch (olErr) {
        console.warn('Open Library cover fetch failed:', olErr);
      }

      // 3. NEW: If we have Gemini key, generate a high-quality SVG cover now
      const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || '';
      if (g_apiKey) {
        console.log(`[Gemini] Generating custom SVG cover for: ${book.title}`);
        const enriched = await enrichBookWithGemini(book);
        if (enriched && enriched.svg) {
           await coverDB.saveCover(book.filename, enriched.svg);
           setCovers(prev => ({ ...prev, [book.filename]: enriched.svg }));

           // Also update metadata so it persists
           const newMetadata = { ...enrichedMetadataRef.current, [book.filename]: enriched };
           setEnrichedMetadata(newMetadata);
           localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
           return;
        }
      }

      // 4. Fallback to AI generation (Pollinations.ai - free, no key needed)
      let visualPrompt = `book cover for "${book.title}" by ${book.author || 'unknown author'}, classical library style, high quality, vintage paper texture`;
      
      // We already checked g_apiKey above
      if (g_apiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey: g_apiKey });
          const result = await (ai as any).models.generateContent({
            model: "gemini-1.5-flash",
            contents: [{ role: 'user', parts: [{ text: `Create a short, vivid visual prompt (15 words max) for an AI image generator to create a book cover for: "${book.title}" by ${book.author}. Focus on the atmosphere and subject. No text.` }] }]
          });
          visualPrompt = result.candidates?.[0]?.content?.parts?.[0]?.text || visualPrompt;
        } catch (e) { /* ignore AI error, use fallback prompt */ }
      }

      const aiCoverUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(visualPrompt)}?width=300&height=450&seed=${book.filename.length}&nologo=true`;
      
      const tempImg = new Image();
      tempImg.crossOrigin = "anonymous";
      tempImg.src = aiCoverUrl;
      await new Promise((resolve) => { tempImg.onload = resolve; tempImg.onerror = resolve; });
      
      if (tempImg.complete && tempImg.naturalWidth > 0) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 300;
          canvas.height = 450;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(tempImg, 0, 0, 300, 450);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            await coverDB.saveCover(book.filename, dataUrl);
            setCovers(prev => ({ ...prev, [book.filename]: dataUrl }));
            return;
          }
        } catch (canvasErr) {
          // CORS tainted canvas - store the Pollinations URL directly
          console.warn('Canvas caching failed for AI cover, storing URL directly:', canvasErr);
          await coverDB.saveCover(book.filename, aiCoverUrl);
          setCovers(prev => ({ ...prev, [book.filename]: aiCoverUrl }));
          return;
        }
      }

      // 4. Last fallback: gradient cover
      await generateCoverFallback(book);
      
    } catch (err) {
      console.warn('Enhanced cover generation failed, using fallback.', err);
      await generateCoverFallback(book);
    } finally {
      // Small delay so the user can see the "Identification" complete
      setTimeout(() => setIdentifyingBookId(null), 1000);
    }
  };

  /**
   * Enrich library metadata using FREE Open Library API.
   * No API key needed. Falls back to existing data if API fails.
   */
  const enrichWithOpenLibrary = async () => {
    if (library.length === 0) return;
    setIsSyncing(true);
    
    const newMetadata = { ...enrichedMetadata };
    let changed = false;

    for (const book of library) {
      // Skip if already enriched
      if (newMetadata[book.filename]?.title && newMetadata[book.filename]?.author) continue;
      
      try {
        const searchTitle = book.title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
        const query = encodeURIComponent(`${searchTitle} ${book.author || ''}`.trim());
        const res = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=1`);
        const data = await res.json();
        
        if (data.docs?.[0]) {
          const doc = data.docs[0];
          const title = doc.title || book.title;
          const author = doc.author_name?.[0] || book.author || '';
          newMetadata[book.filename] = { title, author };
          changed = true;
        }
      } catch (err) {
        console.warn(`Open Library enrichment failed for ${book.title}:`, err);
      }
    }

    if (changed) {
      setEnrichedMetadata(newMetadata);
      localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
      setLibrary(prev => prev.map(book => ({
        ...book,
        title: newMetadata[book.filename]?.title || book.title,
        author: newMetadata[book.filename]?.author || book.author
      })));
    }
    
    setIsSyncing(false);
    
    // Trigger a cover rescan in the background so missing covers are fetched
    setAutoCoverIndex(0);
    setCoverScanKey(prev => prev + 1);
  };

  const generateCoverFallback = async (book: LibraryBook) => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 300, 400);
      const randomHue = Math.floor(Math.random() * 360);
      gradient.addColorStop(0, `hsl(${randomHue}, 40%, 40%)`);
      gradient.addColorStop(1, `hsl(${randomHue}, 40%, 15%)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 300, 400);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, 0, 15, 400);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 24px serif';
      ctx.textAlign = 'center';
      const titleLine = book.title.substring(0, 20);
      ctx.fillText(titleLine, 150, 150);
      if (book.title.length > 20) ctx.fillText(book.title.substring(20, 40), 150, 185);
      ctx.font = 'italic 14px serif';
      ctx.fillText(book.author || 'Desconocido', 150, 240);
      const base64Image = canvas.toDataURL('image/jpeg');
      await coverDB.saveCover(book.filename, base64Image);
      setCovers(prev => ({ ...prev, [book.filename]: base64Image }));
    }
  };

  const handleCoverUpload = async (filename: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      await coverDB.saveCover(filename, base64);
      setCovers(prev => ({ ...prev, [filename]: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const updateBookMetadata = async (filename: string, title: string, author: string) => {
    const newMetadata = { 
      ...enrichedMetadata, 
      [filename]: { title, author } 
    };
    setEnrichedMetadata(newMetadata);
    localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
    
    // Sync to cloud
    await syncService.saveMetadata(newMetadata);
    
    setLibrary(prev => prev.map(book => 
      book.filename === filename ? { ...book, title, author } : book
    ));
  };

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // Refs to avoid stale closures in interval-based auto-cover effect
  const coversRef = useRef(covers);
  coversRef.current = covers;
  const autoCoverIndexRef = useRef(autoCoverIndex);
  autoCoverIndexRef.current = autoCoverIndex;
  const fetchEnhancedCoverRef = useRef(fetchEnhancedCover);
  fetchEnhancedCoverRef.current = fetchEnhancedCover;
  const enrichedMetadataRef = useRef(enrichedMetadata);
  enrichedMetadataRef.current = enrichedMetadata;

  /**
   * Detects idle state and triggers automatic cover generation.
   */
  useEffect(() => {
    if (library.length === 0 || isSyncing) return;
    
    const idleTimer = setTimeout(() => {
      setIsIdle(true);
    }, 5000); // Wait 5 seconds after mount to start background tasks

    return () => clearTimeout(idleTimer);
  }, [library.length, isSyncing]);

  /**
   * Sequentially loads/generates covers and enriches metadata when idle.
   * Uses refs to avoid re-running when covers state changes.
   */
  useEffect(() => {
    if (!isIdle) return;
    
    const timer = setInterval(async () => {
      const idx = autoCoverIndexRef.current;
      if (idx >= library.length) {
        clearInterval(timer);
        setEnrichmentProgress(null);
        return;
      }
      
      const book = library[idx];
      const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || '';

      // 1. Check if metadata needs enrichment (Gemini)
      const currentMeta = enrichedMetadataRef.current[book.filename];
      const needsEnrichment = !currentMeta || 
                             book.title === book.filename || 
                             (book.author === 'Unknown' || !book.author);

      if (needsEnrichment) {
        // Update progress UI only if we are actually doing work
        setEnrichmentProgress({ 
          current: idx + 1, 
          total: library.length, 
          filename: book.filename 
        });

        if (g_apiKey) {
           console.log(`Auto-enriching metadata for: ${book.filename}`);
           const enriched = await enrichBookWithGemini(book);
           if (enriched) {
              const newMetadata = { 
                ...enrichedMetadataRef.current, 
                [book.filename]: enriched 
              };
              setEnrichedMetadata(newMetadata);
              localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
              await syncService.saveMetadata(newMetadata);
              
              // Update library state for this book
              setLibrary(prev => prev.map(b => b.filename === book.filename ? {
                ...b,
                title: enriched.title,
                author: enriched.author,
                svg: enriched.svg
              } : b));

              // If we got an SVG, save it as a cover too
              if (enriched.svg) {
                 await coverDB.saveCover(book.filename, enriched.svg);
                 setCovers(prev => ({ ...prev, [book.filename]: enriched.svg }));
              }
           }
        }
      }
      
      // 2. Check for cover (independent of metadata)
      const hasCover = coversRef.current[book.filename] || (await coverDB.getCover(book.filename));
      if (!hasCover) {
        setEnrichmentProgress({ 
          current: idx + 1, 
          total: library.length, 
          filename: `Cover: ${book.title}` 
        });
        
        try {
          console.log(`Auto-generating cover for: ${book.title}`);
          await fetchEnhancedCoverRef.current(book);
        } catch (err) {
          console.error(`Failed to auto-generate cover for ${book.title}:`, err);
        }
      }

      // 3. Increment index AFTER task attempt
      setAutoCoverIndex(prev => prev + 1);

      // If we're done after this increment, clear progress immediately
      if (idx + 1 >= library.length) {
        setEnrichmentProgress(null);
      }
    }, 10000); // Process next book every 10 seconds (faster swoop)

    return () => clearInterval(timer);
  }, [isIdle, library.length, coverScanKey]);


  // Deep linking logic moved to another effect

  /**
   * Updates the zoom level for the current device category.
   */
  const changeZoom = (delta: number) => {
    const category = getDeviceCategory();
    const currentZoom = typeof zoom === 'number' ? zoom : ((zoom as Record<string, number>)[category] || 1.0);
    const newZoomValue = Math.min(Math.max(currentZoom + delta, 0.5), 3.0);
    
    if (typeof zoom === 'number') {
      setZoom(newZoomValue);
    } else {
      setZoom({
        ...(zoom as Record<string, number>),
        [category]: newZoomValue
      });
    }
  };

  /**
   * Loads reading progress for a specific book from KVDB or localStorage.
   * @param id - The unique identifier (filename) of the book
   */
  const loadProgress = async (id: string): Promise<ReadingProgress | null> => {
    setIsSyncing(true);
    setIsRestoring(true);
    const category = getDeviceCategory();
    
    try {
      const progress = await syncService.loadProgress(id);
      
      // Local fallback for quick start
      const localStr = localStorage.getItem(`catreader_progress_${id}`);
      const local = localStr ? JSON.parse(localStr) : null;
      
      // Prioritize KVDB but merge with local if needed
      const data = progress || local;
      
      if (data) {
        // Handle polymorphic zoom safely
        let targetZoom = 1.0;
        if (typeof data.zoom === 'number') {
          targetZoom = data.zoom;
        } else if (data.zoom && typeof data.zoom === 'object') {
          targetZoom = (data.zoom as Record<string, number>)[category] || (data.zoom as Record<string, number>)['desktop'] || 1.0;
        }

        setPageNumber(data.page || 1);
        setZoom(targetZoom);
        setTheme(data.theme as Theme || 'sepia');
        setScrollRatio(data.scrollRatio || 0);
        if (data.updatedAt) setLastSyncTime(data.updatedAt);
        return data;
      }
      return null;
    } catch (err) {
      console.error('Sync load error:', err);
      return null;
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Saves the current reading progress to KVDB and localStorage.
   * This function is debounced to prevent excessive API calls.
   */
  const saveProgress = useCallback(async () => {
    if (!fileName || !isLoaded || !containerRef.current || isRestoring) return;
    
    setIsSyncing(true);
    const now = Date.now();
    const category = getDeviceCategory();
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const currentScrollRatio = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;

    // Load existing zoom maps
    let zoomMap: Record<string, number> = {};
    const localStr = localStorage.getItem(`catreader_progress_${fileName}`);
    if (localStr) {
      try {
        const p = JSON.parse(localStr);
        if (p.zoom && typeof p.zoom === 'object') {
          zoomMap = { ...p.zoom };
        } else if (typeof p.zoom === 'number') {
          // Back-fill previous device zoom
          zoomMap['desktop'] = p.zoom;
        }
      } catch (e) {}
    }
    zoomMap[category] = typeof zoom === 'number' ? zoom : (zoom[category] || 1.0);

    const progress: ReadingProgress = { 
      page: pageNumber, 
      zoom: zoomMap, 
      theme,
      scrollRatio: currentScrollRatio,
      updatedAt: now
    };
    
    // Save locally first with consistent object-based zoom
    localStorage.setItem(`catreader_progress_${fileName}`, JSON.stringify(progress));
    
    // Track for auto-restore
    localStorage.setItem('catreader_last_book', fileName);
    
    // Sync to Cloud
    await syncService.saveProgress(fileName, progress);
    
    setLastSyncTime(now);
    setIsSyncing(false);
  }, [fileName, isLoaded, isRestoring, zoom, theme, pageNumber, getDeviceCategory]);

  // Debounced save for Cloud Sync: uses scroll activity + max interval, not pageNumber changes
  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;

  useEffect(() => {
    if (!isLoaded || !fileName || !containerRef.current) return;
    let inactivityTimer: ReturnType<typeof setTimeout>;
    let maxIntervalTimer: ReturnType<typeof setTimeout>;

    const scheduleSave = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        saveProgressRef.current();
      }, 15000);
    };

    const handleScrollActivity = () => scheduleSave();
    const container = containerRef.current;
    container.addEventListener('scroll', handleScrollActivity, { passive: true });

    scheduleSave();
    maxIntervalTimer = setInterval(() => {
      saveProgressRef.current();
    }, 60000);

    return () => {
      container.removeEventListener('scroll', handleScrollActivity);
      clearTimeout(inactivityTimer);
      clearInterval(maxIntervalTimer);
    };
  }, [isLoaded, fileName]);

  /**
   * Immediate local storage save removed in favor of unified saveProgress logic.
   */
  // Removed conflicting useEffect that was overwriting polymorphic zoom

  /**
   * Unified persistence handles both local and cloud sync to avoid data corruption.
   */
  // Removed old debounced scroll save to prevent zoom-type conflicts

  /**
   * Handles file selection from the local filesystem.
   * @param e - The file input change event
   */
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      setFileName(file.name);
      setFileType(ext);
      
      // Save to local cache immediately
      await coverDB.saveBookContent(file.name, file);
      
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      
      if (ext === 'txt') {
        const text = await file.text();
        setTextContent(text);
        setNumPages(1);
        // Save ghost text for TXT files too
        await coverDB.saveGhostText(file.name, text);
        await syncService.saveGhostText(file.name, text);
      } else {
        setTextContent(null);
        // Start background ghost text extraction for PDF
        extractGhostText(file, file.name);
      }
      
      await loadProgress(file.name);
      if (ext === 'txt') setIsLoaded(true);
      else setIsLoaded(false);

      // Add to local library state immediately if not already present
      const isNew = !library.some(b => b.filename === file.name);
      if (isNew) {
        const newBook: LibraryBook = {
          id: file.name,
          filename: file.name,
          type: ext,
          title: file.name.replace(/\.[^/.]+$/, "")
        };
        setLibrary(prev => [newBook, ...prev]);
        
        // Auto-enrich new book
        const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || '';
        if (g_apiKey) {
          setTimeout(async () => {
            const enriched = await enrichBookWithGemini(newBook);
            if (enriched) {
              setLibrary(prev => prev.map(b => b.filename === file.name ? { ...b, ...enriched } : b));
              // Update persistent metadata
              const newMeta = { ...enrichedMetadataRef.current, [file.name]: enriched };
              setEnrichedMetadata(newMeta);
              localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMeta));
              await syncService.saveMetadata(newMeta);
            }
          }, 1000);
        }
      }

      // If user is signed in to Google, upload to Drive too
      if (googleToken) {
        await uploadToDrive(file, googleToken);
      }
    }
  };

  /**
   * Extracts all text from a PDF in the background and saves it as "Ghost Text".
   */
  const extractGhostText = async (fileOrBlob: File | Blob, filename: string) => {
    try {
      // Check if we already have it to avoid redundant work
      const existing = await coverDB.getGhostText(filename);
      if (existing) return;

      const remote = await syncService.loadGhostText(filename);
      if (remote) {
        await coverDB.saveGhostText(filename, remote);
        return;
      }

      console.log(`[Ghost] Extracting text for: ${filename}`);
      const data = new Uint8Array(await fileOrBlob.arrayBuffer());
      const loadingTask = (pdfjsBackground as any).getDocument({ data, useSystemFonts: true });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `[Page ${i}]\n${pageText}\n\n`;
      }

      await coverDB.saveGhostText(filename, fullText);
      await syncService.saveGhostText(filename, fullText);
      console.log(`[Ghost] Extraction complete for: ${filename}`);
    } catch (err) {
      console.error('Ghost Text Extraction Error:', err);
    }
  };

  /**
   * Closes the current book and returns to the library view.
   * Clears the active book state and removes the last book tracker.
   */
  const closeBook = () => {
    setFileUrl(null);
    setFileName('');
    setNumPages(0);
    setIsLoaded(false);
    setTextContent(null);
    localStorage.removeItem('catreader_last_book');
  };

  /**
   * Opens a book from the local library.
   * @param book - The library book object to open
   * @param forcePage - Optional page number to jump to
   */
  const openFromLibrary = async (book: LibraryBook, forcePage?: number) => {
    const filename = book.filename;
    setFileName(filename);
    setFileType(book.type);
    
    // Track last opened book
    localStorage.setItem('catreader_last_book', filename);

    try {
      // Check cache first
      const cached = await coverDB.getBookContent(filename);
      let blob: Blob;
      
      if (cached) {
        console.log('Loading from cache:', filename);
        blob = cached;
      } else {
        console.log('Fetching from server:', filename);
        const baseUrl = import.meta.env.BASE_URL || '/';
        const booksDirPath = baseUrl.endsWith('/') ? `${baseUrl}books/` : `${baseUrl}/books/`;
        const url = `${booksDirPath}${filename}`;
        const res = await fetch(url);
        blob = await res.blob();
        // Save to cache
        await coverDB.saveBookContent(filename, blob);
      }

      const url = URL.createObjectURL(blob);
      setFileUrl(url);
      
      if (book.type === 'txt') {
        const text = await blob.text();
        setTextContent(text);
        setNumPages(1);
        await coverDB.saveGhostText(filename, text);
        await syncService.saveGhostText(filename, text);
      } else {
        setTextContent(null);
        extractGhostText(blob, filename);
      }
      
      if (forcePage) {
        setPageNumber(forcePage);
        setScrollRatio(0);
      } else {
        await loadProgress(filename);
      }
    } catch (err) {
      console.error('Error opening book:', err);
      showToast('Error al abrir el libro.');
    }
    
    if (book.type === 'txt') setIsLoaded(true);
    else setIsLoaded(false);
  };

  /**
   * Handles deep linking from URL parameters (?read=...&page=...)
   */
  useEffect(() => {
    if (library.length > 0 && !fileUrl) {
      const params = new URLSearchParams(window.location.search);
      const readQuery = params.get('read');
      const pageQuery = params.get('page');
      
      if (readQuery) {
        const book = library.find(b => b.filename === readQuery || b.id === readQuery);
        if (book) {
          const page = pageQuery ? parseInt(pageQuery) : undefined;
          openFromLibrary(book, page);
        }
      } else {
        // Auto-open last book if no deep link
        const lastBookId = localStorage.getItem('catreader_last_book');
        if (lastBookId) {
          const book = library.find(b => b.filename === lastBookId);
          if (book) openFromLibrary(book);
        }
      }
    }
  }, [library]);

  /**
   * Restores scroll position for text files after content is loaded.
   */
  useEffect(() => {
    if (fileType === 'txt' && isLoaded && scrollRatio > 0 && containerRef.current) {
      const { scrollHeight, clientHeight } = containerRef.current;
      containerRef.current.scrollTo({
        top: scrollRatio * (scrollHeight - clientHeight),
        behavior: 'instant'
      });
      setScrollRatio(0);
    }
  }, [fileType, isLoaded, scrollRatio]);

  /**
   * Scrolls to a specific page.
   * @param targetPage - The page number to scroll to
   */
  const scrollToPage = (targetPage: number) => {
    const pageElement = document.getElementById(`page-${targetPage}`);
    if (pageElement && containerRef.current) {
      pageElement.scrollIntoView({ behavior: 'smooth' });
      setPageNumber(targetPage);
    }
  };

  /**
   * Changes the current page by a given offset (compatibility for buttons).
   * @param offset - The number of pages to move (e.g., 1 or -1)
   */
  const changePage = (offset: number) => {
    const newPage = Math.min(Math.max(1, pageNumber + offset), numPages);
    if (newPage !== pageNumber) {
      scrollToPage(newPage);
    }
  };

  /**
   * Handles wheel events.
   * In continuous scroll mode, we just let the native scroll work.
   */
  const handleWheel = (e: React.WheelEvent) => {
    // We can keep this for UI feedback or leave empty for native scrolling
    if (showUI) {
      // Logic remained minimal
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    window.getSelection()?.removeAllRanges(); // Prevent highlighting hidden text
    const width = window.innerWidth;
    const clickX = e.clientX;
    if (clickX > width * 0.7) changePage(1);
    else if (clickX < width * 0.3) changePage(-1);
    resetUITimer();
  };

  // Page tracking: IntersectionObserver + scroll-based center calculation
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !fileUrl) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;

    // Scroll-based fallback: find page whose center is closest to viewport center
    const handleScrollForPage = () => {
      if (isRestoring) return;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const wrappers = container.querySelectorAll('.page-wrapper');
        if (wrappers.length === 0) return;

        const containerRect = container.getBoundingClientRect();
        const centerY = containerRect.top + containerRect.height / 2;

        let bestPage = pageNumber;
        let bestDist = Infinity;

        wrappers.forEach((w) => {
          const rect = w.getBoundingClientRect();
          const wCenter = rect.top + rect.height / 2;
          const dist = Math.abs(wCenter - centerY);
          if (dist < bestDist) {
            bestDist = dist;
            bestPage = parseInt(w.getAttribute('data-page') || '1');
          }
        });

        setPageNumber(bestPage);
      }, 120);
    };

    container.addEventListener('scroll', handleScrollForPage, { passive: true });

    // IntersectionObserver for quick updates while scrolling
    const observer = new IntersectionObserver(
      (entries) => {
        if (isRestoring) return;
        let bestPage = pageNumber;
        let bestRatio = -1;
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestPage = parseInt(
              entry.target.getAttribute('data-page') || '1'
            );
          }
        });
        if (bestRatio >= 0) {
          setPageNumber(bestPage);
        }
      },
      {
        threshold: Array.from({ length: 21 }, (_, i) => i * 0.05),
        root: container,
      }
    );

    const updateObserver = () => {
      const pages = container.querySelectorAll('.page-wrapper');
      pages.forEach((p) => observer.observe(p));
    };

    const mutationObserver = new MutationObserver(updateObserver);
    mutationObserver.observe(container, { childList: true, subtree: true });
    updateObserver();

    return () => {
      container.removeEventListener('scroll', handleScrollForPage);
      clearTimeout(scrollTimeout);
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [isLoaded, fileName, fileUrl, isRestoring]);

  const themeStyles = {
    light: 'bg-[#f8f9fa] text-stone-900',
    dim: 'bg-[#334155] text-[#cbd5e1]',
    dark: 'bg-[#121212] text-[#a3a3a3]',
    sepia: 'bg-[#e8dcc7] text-[#5c4b37]'
  };

  const pdfFilter = {
    light: 'contrast(0.95)',
    dim: 'invert(0.8) hue-rotate(180deg) brightness(1.2) contrast(0.85)',
    dark: 'invert(1) hue-rotate(180deg) brightness(0.8) contrast(0.8)',
    sepia: 'sepia(0.4) contrast(0.9) brightness(0.9)'
  };

  return (
    <div 
      className={cn("fixed inset-0 overflow-hidden flex flex-col transition-colors duration-500", themeStyles[theme])}
      onMouseMove={resetUITimer}
      onTouchStart={resetUITimer}
    >
      {/* Version Stamp & Diagnostics Toggle */}
      <button 
        onClick={() => setShowDiagnostics(true)}
        className="fixed top-2 right-4 z-40 text-[10px] font-mono opacity-30 select-none hover:opacity-100 transition-opacity uppercase tracking-[0.2em] cursor-help"
        aria-label="Open diagnostics"
      >
        {APP_VERSION}
      </button>

      {/* Diagnostics Overlay */}
      <AnimatePresence>
        {showDiagnostics && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-stone-950/95 backdrop-blur-xl p-6 sm:p-12 overflow-auto"
          >
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <h2 className="text-xl font-mono text-white font-bold">CatReader System Diagnostics</h2>
                </div>
                <button 
                  onClick={() => setShowDiagnostics(false)}
                  className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-sm">
                <div className="bg-stone-900/50 p-4 rounded-xl border border-white/5">
                  <h3 className="text-stone-500 uppercase text-xs mb-3 tracking-widest font-bold">Core State</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Version</span><span className="text-emerald-400">{APP_VERSION}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Device Category</span><span className="text-amber-400 capitalize">{getDeviceCategory()}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Viewport</span><span className="text-white">{window.innerWidth}x{window.innerHeight}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Active Book</span><span className="text-indigo-400 truncate max-w-[200px]">{fileName || 'None'}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Page Buffer</span><span className="text-white">8 (+/- from current)</span></div>
                  </div>
                </div>

                <div className="bg-stone-900/50 p-4 rounded-xl border border-white/5">
                  <h3 className="text-stone-500 uppercase text-xs mb-3 tracking-widest font-bold">Reader Metrics</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Current Page</span><span className="text-emerald-400">{pageNumber} / {numPages || 0}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Zoom Level</span><span className="text-white">{Math.round((typeof zoom === 'number' ? zoom : 1) * 100)}%</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Scroll Ratio</span><span className="text-white">{((scrollRatio || 0) * 100).toFixed(2)}%</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Restoring Lock</span><span className={cn(isRestoring ? "text-amber-500" : "text-stone-500")}>{isRestoring ? "LOCKED" : "READY"}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Layout Map</span><span className="text-white">{(pageRatios || []).length > 0 ? `${pageRatios.length} pages mapped` : (extractingRatios ? "Mapping..." : "Queued")}</span></div>
                    <div className="flex justify-between border-b border-white/5 py-1"><span>Render Errors</span><span className={cn(renderErrors.size > 0 ? "text-red-400" : "text-stone-500")}>{renderErrors.size > 0 ? `${renderErrors.size} pages` : 'None'}</span></div>
                  </div>
                </div>

                <div className="col-span-full bg-stone-900/50 p-4 rounded-xl border border-white/5">
                   <h3 className="text-stone-500 uppercase text-xs mb-3 tracking-widest font-bold">System Integrity Test</h3>
                   <div className="flex flex-wrap gap-4">
                     <button 
                       onClick={() => {
                         showToast(`Integrity: ${(pageRatios || []).length === numPages ? 'PASS' : 'FAIL'} | Sync: ${isSyncing ? 'ACTIVE' : 'IDLE'} | ${getDeviceCategory()}`);
                       }}
                       className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2 rounded-lg transition-all"
                     >
                       Run Core Diagnostics
                     </button>
                   </div>
                </div>
              </div>

              <div className="mt-12 text-center">
                <p className="text-stone-600 text-xs italic font-serif">CatReader: Minimalist, HUD-Enabled, High-Performance PDF Virtualization.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kindle-Style Floating Header */}
      <AnimatePresence>
        {showUI && !isManualHide && fileUrl && (
          <motion.header 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-stone-950/80 text-stone-200 px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md border border-white/5"
          >
            <button 
              onClick={closeBook}
              className="hover:text-white transition-colors p-1"
              title="Volver a la Biblioteca"
              aria-label="Volver a la Biblioteca"
            >
              <Library size={16} />
            </button>
            <span className="text-[10px] font-medium truncate max-w-[100px] text-stone-300">{fileName || 'Reader'}</span>
            
            <div className="w-px h-3 bg-white/10 mx-0.5" />

            {/* Compact Theme Dots */}
            <div className="flex items-center gap-0.5">
              <button onClick={() => setTheme('light')} className={cn("w-3 h-3 rounded-full border border-white/20 transition-all", theme === 'light' ? "bg-[#f8f9fa] ring-1 ring-white/40" : "bg-stone-700 hover:bg-stone-600")} title="Light" aria-label="Light theme" />
              <button onClick={() => setTheme('sepia')} className={cn("w-3 h-3 rounded-full border border-white/20 transition-all", theme === 'sepia' ? "bg-[#e8dcc7] ring-1 ring-amber-400/40" : "bg-stone-700 hover:bg-stone-600")} title="Sepia" aria-label="Sepia theme" />
              <button onClick={() => setTheme('dim')} className={cn("w-3 h-3 rounded-full border border-white/20 transition-all", theme === 'dim' ? "bg-[#334155] ring-1 ring-indigo-400/40" : "bg-stone-700 hover:bg-stone-600")} title="Dim" aria-label="Dim theme" />
              <button onClick={() => setTheme('dark')} className={cn("w-3 h-3 rounded-full border border-white/20 transition-all", theme === 'dark' ? "bg-[#121212] ring-1 ring-white/40" : "bg-stone-700 hover:bg-stone-600")} title="Dark" aria-label="Dark theme" />
            </div>

            <div className="w-px h-3 bg-white/10 mx-0.5" />

            <div className="flex items-center gap-0.5">
              <button onClick={() => changeZoom(-0.1)} className="p-1 hover:bg-white/10 rounded-full text-stone-400 hover:text-white transition-colors"><ZoomOut size={12}/></button>
              <span className="text-[9px] font-mono w-7 text-center text-stone-400">{Math.round((typeof zoom === 'number' ? zoom : (zoom[getDeviceCategory()] || 1.0)) * 100)}%</span>
              <button onClick={() => changeZoom(0.1)} className="p-1 hover:bg-white/10 rounded-full text-stone-400 hover:text-white transition-colors"><ZoomIn size={12}/></button>
            </div>

            <div className="w-px h-3 bg-white/10 mx-0.5" />

            <button 
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={cn(
                "p-1 rounded-full transition-all",
                isFocusMode ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/50" : "text-stone-400 hover:text-white hover:bg-white/10"
              )}
              title="Focus Mode: Zoom to content (F)"
              aria-label="Toggle Focus Mode"
            >
              <Maximize2 size={14} />
            </button>

            <div className="w-px h-3 bg-white/10 mx-0.5" />
            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setShowMenu(!showMenu)}
                className={cn("p-1 hover:bg-white/10 rounded-full transition-colors", showMenu && "bg-white/10")}
                title="Más opciones"
                aria-label="Más opciones"
                aria-expanded={showMenu}
              >
                <MoreVertical size={14} />
              </button>
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                    className="absolute top-full right-0 mt-2 bg-stone-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl py-1 min-w-[160px] z-[70]"
                  >
                    <button onClick={() => { handleGoogleDrive(); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2">
                      <Cloud size={12} /> Google Drive
                    </button>
                    <label className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2 cursor-pointer">
                      <Upload size={12} /> Subir PDF
                      <input type="file" accept=".pdf,.txt" className="hidden" onChange={(e) => { onFileChange(e); setShowMenu(false); }} />
                    </label>
                    <button 
                      onClick={() => {
                        const url = new URL(window.location.href);
                        url.searchParams.set('read', fileName);
                        url.searchParams.set('page', pageNumber.toString());
                        navigator.clipboard.writeText(url.toString());
                        setShowMenu(false);
                        showToast('Enlace directo copiado');
                      }} 
                      className="w-full text-left px-3 py-2 text-xs text-stone-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                    >
                      <span className="text-[10px]">🔗</span> Copiar enlace
                    </button>
                    <div className="border-t border-white/10 my-1" />
                    <button onClick={() => { setShowDiagnostics(true); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-stone-500 hover:bg-white/10 hover:text-stone-300 transition-colors">
                      Diagnostics
                    </button>
                    <button onClick={() => { setIsManualHide(true); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-stone-500 hover:bg-white/10 hover:text-stone-300 transition-colors">
                      Ocultar UI (H)
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Subtle Status Dot */}
      <div className="fixed bottom-2 left-4 z-40 flex items-center gap-2 text-[10px] font-mono select-none uppercase tracking-widest opacity-30 hover:opacity-60 transition-opacity">
        <div className={cn(
          "w-1.5 h-1.5 rounded-full",
          isSyncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
        )} />
        <span>{isSyncing ? 'Syncing' : 'Synced'}</span>
      </div>

      {/* Kindle-Style Progress Bar */}
      {fileUrl && (
        <div className="fixed bottom-0 left-0 right-0 h-[2px] bg-white/5 z-40">
          <div 
            className="h-full bg-indigo-500/40 transition-all duration-500 ease-out"
            style={{ width: `${Math.max(0.5, (pageNumber / (numPages || 1)) * 100)}%` }}
          />
        </div>
      )}

      {/* Main Viewer */}
      <main 
        ref={containerRef}
        className="flex-1 overflow-auto scrollbar-none relative"
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      >
        {!fileUrl ? (
          <LibraryView 
            library={library}
            covers={covers}
            isLoading={isLoadingLibrary}
            onOpenBook={openFromLibrary}
            onEditBook={setEditingBook}
            onGoogleDrive={handleGoogleDrive}
            onFileUpload={onFileChange}
            isSimplified={isSimplified}
            wallpaper={wallpaper}
            onToggleSimplified={() => setIsSimplified(!isSimplified)}
            onSetWallpaper={setWallpaper}
            shelves={shelves}
            onUpdateShelfTitle={updateShelfTitle}
            onMoveBook={moveBook}
            onReorderBook={reorderBook}
            onMagicEnrich={magicFixLibrary}
            onProfileClick={() => setShowProfile(true)}
            clearProgress={() => setEnrichmentProgress(null)}
            identifyingBookId={identifyingBookId}
            isSyncing={isSyncing}
            enrichmentProgress={enrichmentProgress}
            onShareBook={(book) => {
              const url = new URL(window.location.href);
              url.searchParams.set('read', book.filename);
              navigator.clipboard.writeText(url.toString());
              showToast('Enlace directo copiado');
            }}
          />
        ) : (
          <ReaderView 
            fileUrl={fileUrl}
            fileType={fileType}
            textContent={textContent}
            numPages={numPages}
            pageNumber={pageNumber}
            zoom={typeof zoom === 'number' ? zoom : (zoom[getDeviceCategory()] || 1.0)}
            theme={theme}
            scrollRatio={scrollRatio}
            isRestoring={isRestoring}
            pageRatios={pageRatios}
            onLoadSuccess={(pdf) => { 
              setNumPages(pdf.numPages); 
              setIsLoaded(true); 
              
              const extractRatios = async () => {
                setExtractingRatios(true);
                const ratios: number[] = [];
                for (let i = 1; i <= pdf.numPages; i++) {
                  try {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1 });
                    ratios.push(viewport.width / viewport.height);
                  } catch (e) {
                    ratios.push(595/842);
                  }
                }
                setPageRatios(ratios);
                setExtractingRatios(false);
              };
              extractRatios();
            }}
            onPageRenderSuccess={(p) => {
              if (p === pageNumber && containerRef.current) {
                const jump = () => {
                  const pageEl = document.getElementById(`page-${p}`);
                  if (pageEl && containerRef.current) {
                    if (scrollRatio > 0) {
                      const { scrollHeight, clientHeight } = containerRef.current;
                      const targetScroll = scrollRatio * (scrollHeight - clientHeight);
                      containerRef.current.scrollTo({ top: targetScroll, behavior: 'instant' });
                    } else {
                      pageEl.scrollIntoView({ behavior: 'instant' });
                    }
                    setScrollRatio(0);
                    setIsRestoring(false); 
                  }
                };
                if (isRestoring) setTimeout(jump, 100);
                else if (scrollRatio > 0) jump();
              }
            }}
            onPageRenderError={(_p, err) => {
              console.error('Page render error:', err);
              setRenderErrors((prev) => new Set(prev).add(_p));
            }}
            onTextSelection={(text, x, y) => {
              setSelectedTextMenu({ text, x, y });
            }}
            themeStyles={themeStyles}
            pdfFilter={pdfFilter}
            isSimplified={isSimplified}
            isFocusMode={isFocusMode}
          />
        )}
      </main>

      {/* Text Selection Floating Menu */}
      <AnimatePresence>
        {selectedTextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="fixed z-[100] bg-stone-900/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1 flex gap-1 items-center"
            style={{ 
              left: `${selectedTextMenu.x}px`, 
              top: `${selectedTextMenu.y - 50}px`,
              transform: 'translateX(-50%)' 
            }}
          >
            <button 
              onClick={async () => {
                const book = library.find(b => b.filename === fileName);
                if (book) {
                  await updateBookMetadata(fileName, selectedTextMenu.text, book.author || '');
                  showToast('Título actualizado');
                }
                setSelectedTextMenu(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="px-2 py-1 text-[10px] font-bold uppercase tracking-tighter text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              Set Title
            </button>
            <button 
              onClick={async () => {
                const book = library.find(b => b.filename === fileName);
                if (book) {
                  await updateBookMetadata(fileName, book.title, selectedTextMenu.text);
                  showToast('Autor actualizado');
                }
                setSelectedTextMenu(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="px-2 py-1 text-[10px] font-bold uppercase tracking-tighter text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              Set Author
            </button>
            <button 
              onClick={async () => {
                const book = library.find(b => b.filename === fileName);
                if (book) {
                  setIsSyncing(true);
                  const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || '';
                  if (g_apiKey) {
                    try {
                      const genAI = new GoogleGenAI({ apiKey: g_apiKey });
                      const result = await genAI.models.generateContent({
                        model: "gemini-1.5-flash",
                        contents: [{ role: 'user', parts: [{ text: `Generate a beautiful, minimalist SVG book cover (vertical 2:3 ratio, viewBox="0 0 400 600") for a book titled "${book.title}" by "${book.author}". 
                        Use this visual theme description: "${selectedTextMenu.text}". 
                        Include a thin, subtle border (1px) around the cover.
                        Ensure the SVG includes the TITLE (large, bold, centered) and AUTHOR (smaller, centered).
                        Ensure text is highly readable with good contrast.
                        Return ONLY the SVG code.` }] }]
                      });
                      const svg = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
                      const cleanSvg = svg.substring(svg.indexOf('<svg'), svg.lastIndexOf('</svg>') + 6);
                      
                      const newMetadata = { 
                        ...enrichedMetadata, 
                        [fileName]: { ...enrichedMetadata[fileName], svg: cleanSvg } 
                      };
                      setEnrichedMetadata(newMetadata);
                      localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
                      await syncService.saveMetadata(newMetadata);
                      setLibrary(prev => prev.map(b => b.filename === fileName ? { ...b, svg: cleanSvg } : b));
                      
                      showToast('Portada generada');
                    } catch (e) {
                      console.error(e);
                      showToast('Error al generar portada');
                    }
                  }
                  setIsSyncing(false);
                }
                setSelectedTextMenu(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="px-2 py-1 text-[10px] font-bold uppercase tracking-tighter text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
            >
              Magic Cover
            </button>
            <button 
              onClick={() => setSelectedTextMenu(null)}
              className="p-1 text-stone-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimal Page Indicator */}
      {showUI && !isManualHide && fileUrl && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-stone-950/70 text-stone-300 px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm border border-white/5">
          <button onClick={() => changePage(-1)} disabled={pageNumber <= 1} className="disabled:opacity-10 hover:text-white transition-colors p-0.5"><ChevronLeft size={16}/></button>
          <span className="text-[10px] font-mono tabular-nums min-w-[48px] text-center">{pageNumber} / {numPages}</span>
          <button onClick={() => changePage(1)} disabled={pageNumber >= numPages} className="disabled:opacity-10 hover:text-white transition-colors p-0.5"><ChevronRight size={16}/></button>
          {isSyncing && <Loader2 size={10} className="animate-spin absolute -right-5 text-indigo-400" />}
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-stone-900/90 backdrop-blur-md text-white text-xs font-medium px-4 py-2 rounded-full shadow-xl border border-white/10"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Metadata Modal */}
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
        onRegenerateCover={async (title, author) => {
          if (editingBook) {
            setIsSyncing(true);
            await fetchEnhancedCover({ ...editingBook, title, author });
            setIsSyncing(false);
          }
        }}
        isSyncing={isSyncing}
      />

      <ProfileModal 
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onGeneratePFP={handleGeneratePFP}
        isSyncing={isSyncing}
      />
    </div>
  );
}
