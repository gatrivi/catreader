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
  AlertCircle,
  Cloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { syncService, ReadingProgress } from './services/syncService';
import { coverDB } from './services/db';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI, Type } from "@google/genai";

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

type Theme = 'light' | 'dim' | 'dark' | 'sepia';

interface LibraryBook {
  id: string;
  title: string;
  author?: string;
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
  const [theme, setTheme] = useState<Theme>('sepia');
  const [scrollRatio, setScrollRatio] = useState<number>(0);
  const [showUI, setShowUI] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [library, setLibrary] = useState<LibraryBook[]>([]);
  const [enrichedMetadata, setEnrichedMetadata] = useState<Record<string, { title: string; author: string }>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [bufferedPages, setBufferedPages] = useState<Set<number>>(new Set());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [quadrant, setQuadrant] = useState(1);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [direction, setDirection] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const [autoCoverIndex, setAutoCoverIndex] = useState(0);
  
  // --- Refs ---
  const containerRef = useRef<HTMLDivElement>(null);
  const uiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gapiLoaded = useRef(false);
  const gisLoaded = useRef(false);
  const lastScrollTime = useRef(0);
  const wheelAccumulator = useRef(0);

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
      
      // Load enriched metadata from localStorage
      const stored = localStorage.getItem('catreader_enriched_metadata');
      if (stored) {
        const metadata = JSON.parse(stored);
        setEnrichedMetadata(metadata);
        
        const enriched = data.map((book: LibraryBook) => ({
          ...book,
          title: metadata[book.filename]?.title || book.title,
          author: metadata[book.filename]?.author || ''
        }));
        setLibrary(enriched);
      } else {
        setLibrary(data);
      }

      // Load covers from IndexedDB
      const loadedCovers: Record<string, string> = {};
      for (const book of data) {
        const cover = await coverDB.getCover(book.filename);
        if (cover) loadedCovers[book.filename] = cover;
      }
      setCovers(loadedCovers);
      
    } catch (err) {
      console.error('Failed to fetch library:', err);
    }
  }, []);

  /**
   * Enriches the library using Gemini LLM magic.
   * Parses filenames to extract clean titles and authors.
   */
  const magicFixLibrary = async () => {
    if (library.length === 0) return;
    setIsSyncing(true);
    
    try {
      const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      if (!g_apiKey) return;
      
      const ai = new GoogleGenAI(g_apiKey);
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const filenames = library.map(b => b.filename).join('\n');
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: `Parse these filenames and return a JSON array of objects with 'filename', 'title', and 'author'. 
        Clean up the titles (remove extensions, underscores, etc.) and identify the author if possible.
        Return ONLY valid JSON.
        Filenames:
        ${filenames}` }] }]
      });

      const response = await result.response;
      const responseText = response.text();
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      const enriched = JSON.parse(cleanJson || '[]');
      const newMetadata = { ...enrichedMetadata };
      
      enriched.forEach((item: any) => {
        newMetadata[item.filename] = { title: item.title, author: item.author };
      });

      setEnrichedMetadata(newMetadata);
      localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
      
      // Update current library state
      const updatedLibrary = library.map(book => ({
        ...book,
        title: newMetadata[book.filename]?.title || book.title,
        author: newMetadata[book.filename]?.author || ''
      }));
      setLibrary(updatedLibrary);
      
    } catch (err) {
      console.error('Magic Fix Error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Internal version of fetchEnhancedCover for automatic use.
   * Tries Google Books first, then falls back to AI generation.
   */
  const fetchEnhancedCover = async (book: LibraryBook) => {
    try {
      // 1. Try Google Books API first
      const searchTitle = book.title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      const query = encodeURIComponent(`intitle:${searchTitle}${book.author ? ` inauthor:${book.author}` : ''}`);
      const gBooksRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
      const gBooksData = await gBooksRes.json();
      
      const thumbnail = gBooksData.items?.[0]?.volumeInfo?.imageLinks?.thumbnail || 
                        gBooksData.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
      
      if (thumbnail) {
        // Use the professional cover if found (replace http with https for security)
        const secureThumbnail = thumbnail.replace('http://', 'https://');
        await coverDB.saveCover(book.filename, secureThumbnail);
        setCovers(prev => ({ ...prev, [book.filename]: secureThumbnail }));
        return;
      }

      // 2. Fallback to AI generation (Pollinations.ai)
      // We use Gemini to create a good visual prompt if possible, otherwise we use a generic one
      let visualPrompt = `book cover for "${book.title}" by ${book.author || 'unknown author'}, classical library style, high quality, vintage paper texture`;
      
      const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      if (g_apiKey) {
        try {
          const ai = new GoogleGenAI(g_apiKey);
          const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: `Create a short, vivid visual prompt (15 words max) for an AI image generator to create a book cover for: "${book.title}" by ${book.author}. Focus on the atmosphere and subject. No text.` }] }]
          });
          const response = await result.response;
          visualPrompt = response.text().trim();
        } catch (e) { /* ignore AI error, use fallback prompt */ }
      }

      const aiCoverUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(visualPrompt)}?width=300&height=450&seed=${book.filename.length}&nologo=true`;
      
      // We don't necessarily need to save the Pollinations URL to DB since it's dynamic, 
      // but let's save the dataURL to avoid re-fetching
      const tempImg = new Image();
      tempImg.crossOrigin = "anonymous";
      tempImg.src = aiCoverUrl;
      await new Promise((resolve) => { tempImg.onload = resolve; tempImg.onerror = resolve; });
      
      if (tempImg.complete && tempImg.naturalWidth > 0) {
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
      }

      // 3. Last fallback: The original gradient cover
      await generateCoverFallback(book);
      
    } catch (err) {
      console.warn('Enhanced cover generation failed, using fallback.', err);
      await generateCoverFallback(book);
    }
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

  const updateBookMetadata = (filename: string, title: string, author: string) => {
    const newMetadata = { 
      ...enrichedMetadata, 
      [filename]: { title, author } 
    };
    setEnrichedMetadata(newMetadata);
    localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
    
    setLibrary(prev => prev.map(book => 
      book.filename === filename ? { ...book, title, author } : book
    ));
  };

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

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
   * Sequentially loads/generates covers when idle.
   */
  useEffect(() => {
    const loadNextCover = async () => {
      if (!isIdle || autoCoverIndex >= library.length) return;
      
      const book = library[autoCoverIndex];
      
      // If we already have the cover in state, skip to next
      if (covers[book.filename]) {
        setAutoCoverIndex(prev => prev + 1);
        return;
      }

      // Check IndexedDB first (extra safety)
      const existing = await coverDB.getCover(book.filename);
      if (existing) {
        setCovers(prev => ({ ...prev, [book.filename]: existing }));
        setAutoCoverIndex(prev => prev + 1);
        return;
      }

      // If no cover, try to generate it (only if we have an API key)
      if (import.meta.env.VITE_GEMINI_API_KEY) {
        try {
          console.log(`Auto-generating cover for: ${book.title}`);
          await fetchEnhancedCover(book);
        } catch (err) {
          console.error(`Failed to auto-generate cover for ${book.title}:`, err);
        }
      }
      
      setAutoCoverIndex(prev => prev + 1);
    };

    const timer = setTimeout(loadNextCover, 10000); // Process next cover every 10 seconds to avoid 429s
    return () => clearTimeout(timer);
  }, [isIdle, autoCoverIndex, library, covers]);


  // Deep linking logic moved to another effect

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
        setTheme(progress.theme as Theme || 'sepia');
        setScrollRatio(progress.scrollRatio || 0);
        setLastSyncTime(progress.updatedAt);
      } else {
        // Fallback to local storage if KVDB is empty
        const local = localStorage.getItem(`catreader_progress_${id}`);
        if (local) {
          const { page, zoom, theme, scrollRatio } = JSON.parse(local);
          setPageNumber(page || 1);
          setZoom(zoom || 1.0);
          setTheme(theme || 'sepia');
          setScrollRatio(scrollRatio || 0);
        } else {
          setPageNumber(1);
          setZoom(1.0);
          setTheme('sepia');
          setScrollRatio(0);
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
    if (!fileName || !isLoaded || !containerRef.current) return;
    
    setIsSyncing(true);
    const now = Date.now();
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const currentScrollRatio = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;

    const progress: ReadingProgress = { 
      page: pageNumber, 
      zoom, 
      theme,
      scrollRatio: currentScrollRatio,
      updatedAt: now
    };
    
    await syncService.saveProgress(fileName, progress);
    
    setLastSyncTime(now);
    setIsSyncing(false);
  }, [fileName, pageNumber, zoom, theme, isLoaded]);

  // Debounced save for Cloud Sync
  useEffect(() => {
    if (isLoaded && fileName) {
      const timer = setTimeout(saveProgress, 15000); // Save every 15 seconds of inactivity
      return () => clearTimeout(timer);
    }
  }, [saveProgress, isLoaded, fileName, pageNumber]); // Adding pageNumber to trigger reset

  /**
   * Immediate local storage save for better reliability.
   * This ensures that even if the user closes the tab immediately, progress is saved.
   */
  useEffect(() => {
    if (fileName && isLoaded && containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const currentScrollRatio = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;

      const progress = { 
        page: pageNumber, 
        zoom, 
        theme, 
        scrollRatio: currentScrollRatio,
        updatedAt: Date.now() 
      };
      localStorage.setItem(`catreader_progress_${fileName}`, JSON.stringify(progress));
    }
  }, [fileName, pageNumber, zoom, theme, isLoaded]);

  // Debounced scroll position save
  useEffect(() => {
    if (!fileName || !isLoaded || !containerRef.current) return;
    
    const handleScroll = () => {
      if (!containerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const currentScrollRatio = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
      
      const progress = { 
        page: pageNumber, 
        zoom, 
        theme, 
        scrollRatio: currentScrollRatio,
        updatedAt: Date.now() 
      };
      localStorage.setItem(`catreader_progress_${fileName}`, JSON.stringify(progress));
    };

    const container = containerRef.current;
    let timeout: NodeJS.Timeout;
    
    const debouncedScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(handleScroll, 500);
    };

    container.addEventListener('scroll', debouncedScroll);
    return () => {
      container.removeEventListener('scroll', debouncedScroll);
      clearTimeout(timeout);
    };
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
    const url = `/books/${book.filename}`;
    setFileUrl(url);
    setFileName(book.filename);
    setFileType(book.type);
    
    // Track last opened book
    localStorage.setItem('catreader_last_book', book.filename);
    
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
    
    if (forcePage) {
      setPageNumber(forcePage);
      setScrollRatio(0);
    } else {
      await loadProgress(book.filename);
    }
    
    if (book.type === 'txt') setIsLoaded(true);
    else setIsLoaded(false);
  };

  /**
   * Handles deep linking from URL parameters (?book=...&page=...)
   */
  useEffect(() => {
    if (library.length > 0 && !fileUrl) {
      const params = new URLSearchParams(window.location.search);
      const bookQuery = params.get('book');
      const pageQuery = params.get('page');
      
      if (bookQuery) {
        const book = library.find(b => b.filename === bookQuery || b.id === bookQuery);
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

  // Quadrant logic and scroll position tracking
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
      
      // Global Page Tracker Observer
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const p = parseInt(entry.target.getAttribute('data-page') || '1');
              setPageNumber(p);
            }
          });
        },
        { 
          threshold: 0.1, 
          root: container,
          rootMargin: '-10% 0% -80% 0%' // Trigger when top of page enters top 10% of viewport
        }
      );

      const updateObserver = () => {
        const pages = container.querySelectorAll('.page-wrapper');
        pages.forEach(p => observer.observe(p));
      };

      // Observe existing and new pages
      const mutationObserver = new MutationObserver(updateObserver);
      mutationObserver.observe(container, { childList: true, subtree: true });
      updateObserver();

      return () => {
        container.removeEventListener('scroll', handleScroll);
        observer.disconnect();
        mutationObserver.disconnect();
      };
    }
  }, [isLoaded, fileName]);

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
              <button 
                onClick={closeBook}
                className="hover:text-indigo-400 transition-colors p-1"
                title="Volver a la Biblioteca"
              >
                <Library size={18} />
              </button>
              <span className="text-xs font-bold tracking-tighter bg-indigo-500 px-1.5 py-0.5 rounded ml-1">CAT</span>
              <span className="text-sm font-medium truncate max-w-[150px]">{fileName || 'Reader'}</span>
            </div>
            
            <div className="flex items-center gap-1">
              <button onClick={() => setTheme('light')} className={cn("p-1.5 rounded-full", theme === 'light' && "bg-white/20")}><Sun size={14}/></button>
              <button onClick={() => setTheme('sepia')} className={cn("p-1.5 rounded-full", theme === 'sepia' && "bg-white/20")}><Coffee size={14}/></button>
              <button onClick={() => setTheme('dim')} className={cn("p-1.5 rounded-full", theme === 'dim' && "bg-white/20")}><Moon size={14} className="opacity-70"/></button>
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
              <button onClick={closeBook} className="p-1.5 hover:bg-white/10 rounded-full" title="Cerrar Libro"><X size={14}/></button>
              <button onClick={handleGoogleDrive} className="p-1.5 hover:bg-white/10 rounded-full" title="Google Drive"><Cloud size={14}/></button>
              <button 
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set('book', fileName);
                  url.searchParams.set('page', pageNumber.toString());
                  navigator.clipboard.writeText(url.toString());
                  alert('Enlace de página copiado');
                }} 
                className="p-1.5 hover:bg-white/10 rounded-full" 
                title="Copiar enlace de página"
              >
                <div className="flex flex-col items-center gap-0">
                  <div className="w-2.5 h-2.5 border border-current flex items-center justify-center">
                    <div className="w-1 h-1 bg-current" />
                  </div>
                </div>
              </button>
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
        className="flex-1 overflow-auto scrollbar-none relative"
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      >
        {!fileUrl ? (
          <div className="min-h-full bg-[#8b5a2b] p-8" style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #8b5a2b, #8b5a2b 200px, #5c3a21 200px, #5c3a21 220px)' }}>
            <div className="max-w-6xl mx-auto pt-10">
              <div className="flex items-center justify-between mb-12 bg-stone-900/80 backdrop-blur-sm p-4 rounded-2xl border border-white/10 shadow-xl">
                <div className="flex items-center gap-3">
                  <Library className="text-amber-500" size={28} />
                  <h1 className="text-2xl font-serif font-bold text-white">Mi Biblioteca</h1>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleGoogleDrive}
                    className="flex items-center gap-2 bg-stone-800 text-white hover:bg-stone-700 transition-all px-4 py-2 rounded-xl text-sm font-bold"
                  >
                    <Cloud size={16} />
                    Drive
                  </button>
                  <label className="flex items-center gap-2 bg-stone-800 text-white hover:bg-stone-700 transition-all px-4 py-2 rounded-xl text-sm font-bold cursor-pointer">
                    <Upload size={16} />
                    Subir
                    <input type="file" accept=".pdf,.txt" className="hidden" onChange={onFileChange} />
                  </label>
                </div>
              </div>

              {library.length === 0 ? (
                <div className="text-center py-20 text-stone-300/80 font-serif">
                  <p className="text-xl mb-4">Tu biblioteca está vacía.</p>
                  <p className="text-sm">Sube un libro o conecta tu Google Drive para empezar.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-x-8 gap-y-12 max-w-5xl mx-auto pb-20 mt-16">
                  {library.map(book => (
                    <div key={book.id} className="group relative flex flex-col items-center w-36">
                      <div 
                        onClick={() => openFromLibrary(book)}
                        className="relative w-32 h-48 bg-[#f4ecd8] shadow-[5px_5px_15px_rgba(0,0,0,0.6)] rounded-r-md border-l-4 border-[#8b5a2b] cursor-pointer hover:-translate-y-4 transition-transform duration-300 flex flex-col"
                      >
                        {covers[book.filename] ? (
                          <img src={covers[book.filename]} alt={book.title} className="w-full h-full object-cover rounded-r-md" />
                        ) : (
                          <div className="flex-1 p-3 flex flex-col justify-between text-center overflow-hidden">
                            <div className="text-[#5b4636] font-serif font-bold text-sm leading-tight line-clamp-4 mt-2">
                              {book.title}
                            </div>
                            <div className="text-[#8b5a2b] font-serif text-[10px] uppercase tracking-widest line-clamp-2 mb-2">
                              {book.author || 'Autor Desconocido'}
                            </div>
                          </div>
                        )}
                        
                        {/* Book spine effect */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/10"></div>
                        <div className="absolute left-1 top-0 bottom-0 w-px bg-white/30"></div>
                      </div>
                      
                      {/* Edit & Cover Actions */}
                      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-stone-900/90 p-1.5 rounded-lg shadow-xl border border-white/10 z-10">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const newTitle = prompt('Nuevo título:', book.title);
                            const newAuthor = prompt('Nuevo autor:', book.author || '');
                            if (newTitle !== null) {
                              updateBookMetadata(book.filename, newTitle, newAuthor || '');
                            }
                          }}
                          className="p-1.5 hover:bg-white/20 rounded text-stone-300 hover:text-white transition-colors"
                          title="Editar metadatos"
                        >
                          <RefreshCw size={12} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = new URL(window.location.href);
                            url.searchParams.set('book', book.filename);
                            navigator.clipboard.writeText(url.toString());
                            alert('Enlace copiado al portapapeles');
                          }}
                          className="p-1.5 hover:bg-white/20 rounded text-stone-300 hover:text-white transition-colors"
                          title="Compartir"
                        >
                          <Upload size={12} className="rotate-180" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const randomPage = Math.floor(Math.random() * 20) + 5; // Simplified random for now, will improve after PDF loads
                            openFromLibrary(book, randomPage);
                          }}
                          className="p-1.5 hover:bg-white/20 rounded text-stone-300 hover:text-white transition-colors"
                          title="Página aleatoria"
                        >
                          <span className="text-[10px] font-bold">🎲</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-full flex flex-col items-center justify-start p-0 sm:p-8">
                {fileType === 'pdf' ? (
                  <div className="relative shadow-2xl flex flex-col gap-0 py-0" style={{ filter: pdfFilter[theme] }}>
                    <Document
                      file={fileUrl}
                      onLoadSuccess={({ numPages }) => { setNumPages(numPages); setIsLoaded(true); }}
                      loading={<div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={48}/></div>}
                    >
                      {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => {
                        const isVisible = Math.abs(p - pageNumber) <= 3; // 3-page buffer
                        return (
                          <div 
                            key={`page-wrap-${p}`} 
                            id={`page-${p}`}
                            data-page={p}
                            className="page-wrapper bg-white/5"
                            style={{ 
                              minHeight: zoom * 842, // A4 aspect ratio height at 72dpi is approx 842
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center'
                            }}
                          >
                            {isVisible ? (
                              <Page 
                                pageNumber={p} 
                                scale={zoom} 
                                renderTextLayer={true}
                                renderAnnotationLayer={true}
                                loading={<div style={{ height: zoom * 842 }} className="flex items-center justify-center text-stone-500/20 font-serif italic">Cargando página {p}...</div>}
                                onRenderSuccess={() => {
                                  if (p === pageNumber && scrollRatio > 0 && containerRef.current) {
                                    setTimeout(() => {
                                      const pageEl = document.getElementById(`page-${p}`);
                                      if (pageEl) pageEl.scrollIntoView({ behavior: 'instant' });
                                    }, 100);
                                    setScrollRatio(0);
                                  }
                                }}
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
                  scrollToPage(newPage);
                }}
                className="w-32 h-1 bg-white/20 rounded-full mt-1 appearance-none cursor-pointer accent-indigo-500"
              />
              {/* Buffer Indicator */}
              {fileType === 'pdf' && (
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3].map(offset => {
                    const p = pageNumber + offset;
                    if (p > numPages) return null;
                    const isBuffered = bufferedPages.has(p);
                    return (
                      <div 
                        key={`dot-${p}`} 
                        className={cn("w-1 h-1 rounded-full", isBuffered ? "bg-emerald-400" : "bg-white/20")}
                        title={isBuffered ? `Página ${p} lista` : `Cargando página ${p}...`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            <button onClick={() => changePage(1)} disabled={pageNumber >= numPages} className="disabled:opacity-20"><ChevronRight size={20}/></button>
            
            {isSyncing && <Loader2 size={12} className="animate-spin absolute -right-6 text-indigo-400" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
