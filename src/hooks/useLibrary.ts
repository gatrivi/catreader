import { useState, useEffect, useCallback, useRef } from 'react';
import { syncService } from '../services/syncService';
import { coverDB } from '../services/db';
import { GoogleGenAI } from "@google/genai";
import * as pdfjsBackground from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createThumbnail } from '../utils/image';

export interface LibraryBook {
  id: string;
  title: string;
  author?: string;
  filename: string;
  type: string;
  svg?: string;
  /** Has a pre-baked audiobook available (cassette icon on cover) */
  audio?: boolean;
  /** Path to paper-manifest.json when Paper Soul bake exists */
  paper?: string;
  coverSource?: {
    type: 'user-custom' | 'ai-generated' | 'openlibrary';
    url?: string;
    svgPath?: string;
    updatedAt?: number;
  };
}

interface UseLibraryProps {
  showToast: (msg: string) => void;
  setIsSyncing: (val: boolean) => void;
  setGlobalStatus: (val: string | null) => void;
  setGlobalError: (val: { message: string; details?: string } | null) => void;
  setIdentifyingBookId: (val: string | null) => void;
  isSyncing: boolean;
}

/**
 * Hook to manage the book library.
 * Handles fetching, metadata enrichment, covers, and background tasks.
 */
export function useLibrary({
  showToast,
  setIsSyncing,
  setGlobalStatus,
  setGlobalError,
  setIdentifyingBookId,
  isSyncing
}: UseLibraryProps) {
  const [library, setLibrary] = useState<LibraryBook[]>([]);
  const [enrichedMetadata, setEnrichedMetadata] = useState<Record<string, { title: string; author: string; svg?: string; coverSource?: any }>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [isLoadingLibrary, setIsLoadingLibrary] = useState<boolean>(true);
  const [isIdle, setIsIdle] = useState(false);
  const [autoCoverIndex, setAutoCoverIndex] = useState(0);
  const [coverScanKey, setCoverScanKey] = useState(0);
  const [enrichmentProgress, setEnrichmentProgress] = useState<{ current: number; total: number; filename?: string } | null>(null);
  const [savedBookCovers, setSavedBookCovers] = useState<Record<string, boolean>>({});

  const markCoverAsSaved = useCallback((filename: string) => {
    setSavedBookCovers(prev => ({ ...prev, [filename]: true }));
    setTimeout(() => {
      setSavedBookCovers(prev => ({ ...prev, [filename]: false }));
    }, 3000);
  }, []);

  const enrichedMetadataRef = useRef(enrichedMetadata);
  enrichedMetadataRef.current = enrichedMetadata;
  const coversRef = useRef(covers);
  coversRef.current = covers;
  const autoCoverIndexRef = useRef(autoCoverIndex);
  autoCoverIndexRef.current = autoCoverIndex;

  /**
   * Fetches the list of available books from books.json and cloud metadata.
   */
  const fetchLibrary = useCallback(async () => {
    console.log('[Library] Starting fetch...');
    setGlobalStatus('Cargando biblioteca...');
    setIsLoadingLibrary(true);
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const booksJsonPath = baseUrl.endsWith('/') ? `${baseUrl}books.json` : `${baseUrl}/books.json`;

      const res = await fetch(booksJsonPath);
      if (!res.ok) throw new Error(`books.json not found (${res.status})`);

      const data = await res.json();
      
      // Filter out user-deleted books (static books they chose to hide)
      const deletedRaw = localStorage.getItem('catreader_deleted_books');
      const deletedSet = new Set(deletedRaw ? JSON.parse(deletedRaw) : []);
      const visibleData = data.filter((b: LibraryBook) => !deletedSet.has(b.filename));
      
      setLibrary(visibleData);
      setIsLoadingLibrary(false);
      setGlobalStatus(null);

      // Load enriched metadata in the background
      (async () => {
        try {
          let metadata: Record<string, { title: string; author: string; svg?: string; coverSource?: any }> = {};
          
          // 1. Load from local IndexedDB (robust, persistent cache)
          try {
            const localDbMetadata = await coverDB.getAllBookMetadata();
            if (localDbMetadata && Object.keys(localDbMetadata).length > 0) {
              metadata = { ...localDbMetadata };
            }
          } catch (dbErr) {
            console.error('Failed to load local DB metadata:', dbErr);
          }

          // 2. Merge with LocalStorage (legacy fallback)
          const localStored = localStorage.getItem('catreader_enriched_metadata');
          if (localStored) {
            try {
              const parsed = JSON.parse(localStored);
              metadata = { ...parsed, ...metadata };
            } catch (e) {}
          }

          // 3. Merge with Cloud Metadata (authoritative sync)
          try {
            const cloudMetadata = await syncService.loadMetadata();
            if (cloudMetadata) {
              for (const [key, cloudBookMeta] of Object.entries(cloudMetadata)) {
                const localBookMeta = metadata[key];
                if (localBookMeta) {
                  metadata[key] = {
                    ...localBookMeta,
                    ...cloudBookMeta,
                    coverSource: cloudBookMeta.coverSource || localBookMeta.coverSource,
                    svg: cloudBookMeta.svg || localBookMeta.svg
                  };
                } else {
                  metadata[key] = cloudBookMeta;
                }
              }
            }
          } catch (cloudErr) {}

          if (Object.keys(metadata).length > 0) {
            setEnrichedMetadata(metadata);
            localStorage.setItem('catreader_enriched_metadata', JSON.stringify(metadata));

            // Back-fill metadata to IndexedDB to ensure robust offline persistence
            try {
              for (const [fname, meta] of Object.entries(metadata)) {
                await coverDB.saveBookMetadata(fname, meta);
              }
            } catch (fillErr) {}
          }

          // Build complete library including manually uploaded books from IndexedDB
          const staticFilenames = new Set(data.map((b: LibraryBook) => b.filename));
          const customBooks: LibraryBook[] = [];
          for (const [fname, meta] of Object.entries(metadata)) {
            if (!staticFilenames.has(fname)) {
              customBooks.push({
                id: fname,
                filename: fname,
                type: fname.split('.').pop()?.toLowerCase() || 'pdf',
                title: meta.title || fname.replace(/\.[^/.]+$/, ""),
                author: meta.author || 'Desconocido',
                svg: meta.svg || '',
                coverSource: meta.coverSource || undefined
              });
            }
          }

          const enriched = data.map((book: LibraryBook) => {
            const meta = metadata[book.filename];
            // If user has a custom cover source, suppress the old SVG so it doesn't flash
            // before the real cover loads from IndexedDB.
            const hasCustomCover = meta?.coverSource?.type === 'user-custom';
            return {
              ...book,
              title: meta?.title || book.title,
              author: meta?.author || '',
              svg: hasCustomCover ? undefined : (meta?.svg ?? book.svg),
              coverSource: meta?.coverSource || undefined
            };
          });

          const allBooks = [...enriched, ...customBooks];
          setLibrary(allBooks);

          // Load covers from IndexedDB for ALL books (both static and custom)
          console.log(`[Covers] Loading covers for ${allBooks.length} books from IndexedDB...`);
          const loadedCovers: Record<string, string> = {};
          for (const book of allBooks) {
            const cover = await coverDB.getCover(book.filename);
            if (cover) {
              console.log(`[Covers] Loaded cover for ${book.title} (${book.filename})`);
              loadedCovers[book.filename] = cover;
            } else if (book.coverSource?.type === 'user-custom' && book.coverSource?.url) {
              console.log(`[Covers] Missing local cover for ${book.title}, starting lazy rehydration from cloud`);
              // LAZY REHYDRATION: Fetch custom cover from Firebase Storage in background
              console.log(`[Cover Sync] Lazy downloading cover for: ${book.title}`);
              (async (bUrl, bFilename) => {
                try {
                  const r = await fetch(bUrl);
                  if (r.ok) {
                    const blob = await r.blob();
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                      const base64 = reader.result as string;
                      await coverDB.saveCover(bFilename, base64);
                      setCovers(prev => ({ ...prev, [bFilename]: base64 }));
                    };
                    reader.readAsDataURL(blob);
                  }
                } catch (err) {
                  console.error('[Cover Sync] Failed to lazy download cover:', err);
                }
              })(book.coverSource.url, book.filename);
            }
          }
          setCovers(loadedCovers);
        } catch (mErr) {
          console.warn('Metadata enrichment skipped:', mErr);

          // Fallback if metadata load fails
          const loadedCovers: Record<string, string> = {};
          for (const book of data) {
            const cover = await coverDB.getCover(book.filename);
            if (cover) loadedCovers[book.filename] = cover;
          }
          setCovers(loadedCovers);
        }
      })();
    } catch (err) {
      console.error('Failed to fetch library:', err);
      setIsLoadingLibrary(false);
      setGlobalStatus(null);
    }
  }, [setGlobalStatus]);

  /**
   * Extracts pages of a PDF as base64 images for OCR.
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
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport, canvas }).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
      }
      return images;
    } catch (err) {
      console.error('Error extracting pages for OCR:', err);
      return [];
    }
  };

  /**
   * Enriches a single book using Gemini.
   */
  const enrichBookWithGemini = useCallback(async (book: LibraryBook) => {
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
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts }]
      });
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      const enriched = JSON.parse(cleanJson);

      if (enriched && enriched.title) {
        return {
          title: enriched.title,
          author: enriched.author,
          svg: enriched.svg
        };
      }
      return null;
    } catch (err) {
      console.error('Enrichment error:', err);
      return null;
    } finally {
      setIdentifyingBookId(null);
    }
  }, [setIdentifyingBookId]);

  /**
   * Batch enriches the entire library with AI.
   */
  const bulkMagic = async () => {
    if (library.length === 0) return;
    setIsSyncing(true);
    let updatedCount = 0;
    
    try {
      const newMetadata = { ...enrichedMetadataRef.current };
      for (const book of library) {
        // Skip if already has clear title/author
        if (newMetadata[book.filename]?.title && newMetadata[book.filename]?.author && 
            newMetadata[book.filename].title !== book.filename) continue;

        const enriched = await enrichBookWithGemini(book);
        if (enriched) {
          newMetadata[book.filename] = { ...newMetadata[book.filename], ...enriched };
          updatedCount++;
        }
      }

      setEnrichedMetadata(newMetadata);
      localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
      await syncService.saveMetadata(newMetadata);
      
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
   * Fallback cover generator (Canvas gradient).
   */
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

  /**
   * Fetches enhanced covers from various APIs.
   */
  const fetchEnhancedCover = useCallback(async (book: LibraryBook, forceAI = false) => {
    console.log(`[Cover] fetchEnhancedCover called for ${book.title}, forceAI=${forceAI}`);
    const meta = enrichedMetadataRef.current[book.filename];
    if (meta?.coverSource?.type === 'user-custom' && !forceAI) {
      console.log(`[Cover] Preserving user-custom coverSource for: ${book.title}`);
      return;
    }
    // Check if there is already a custom user-captured/uploaded cover
    try {
      const existingCover = await coverDB.getCover(book.filename);
      const isCaptured = existingCover && (
        existingCover.startsWith('data:image/jpeg') ||
        existingCover.startsWith('data:image/png') ||
        existingCover.startsWith('data:image/webp')
      );
      if (isCaptured && !forceAI) {
        console.log(`[Cover] Preserving custom/captured cover for: ${book.title}`);
        return;
      }
      console.log(`[Cover] No custom cover found for ${book.title}, fetching enhanced...`);
    } catch (e) {
      console.warn('[Cover] Error checking existing cover:', e);
    }

    setIdentifyingBookId(book.id);
    try {
      const searchTitle = book.title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      
      // If forceAI is not set, try external APIs first
      if (!forceAI) {
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
        } catch (olErr) {}
      }

      // If forceAI is set OR external APIs failed, try Gemini/SVG
      if (enrichedMetadataRef.current[book.filename]?.svg && !forceAI) {
        const existingDb = await coverDB.getCover(book.filename);
        if (existingDb && !existingDb.includes('<svg') && existingDb !== enrichedMetadataRef.current[book.filename].svg) {
          return;
        }
        const svg = enrichedMetadataRef.current[book.filename].svg as string;
        await coverDB.saveCover(book.filename, svg);
        setCovers(prev => ({ ...prev, [book.filename]: svg }));
        return;
      }

      const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || '';
      if (g_apiKey) {
        const enriched = await enrichBookWithGemini(book);
        if (enriched && enriched.svg) {
           await coverDB.saveCover(book.filename, enriched.svg);
           setCovers(prev => ({ ...prev, [book.filename]: enriched.svg }));
            const newMetadata = { ...enrichedMetadataRef.current, [book.filename]: enriched };
            setEnrichedMetadata(newMetadata);
            localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
            try {
              await coverDB.saveBookMetadata(book.filename, enriched);
            } catch (dbErr) {}
            return;
        }
      }

      await generateCoverFallback(book);
    } catch (err) {
      await generateCoverFallback(book);
    } finally {
      setTimeout(() => setIdentifyingBookId(null), 1000);
    }
  }, [enrichBookWithGemini, setIdentifyingBookId]);

  const handleCoverUpload = async (filename: string, file: File) => {
    console.log(`[CoverUpload] Starting upload for ${filename}`);
    setIsSyncing(true);
    try {
      const { thumbnail, thumbHash } = await createThumbnail(file);
      console.log(`[CoverUpload] Thumbnail created, size: ${thumbnail.length}`);
      await coverDB.saveCover(filename, thumbnail);
      console.log(`[CoverUpload] Saved to IndexedDB`);
      setCovers(prev => ({ ...prev, [filename]: thumbnail }));
      markCoverAsSaved(filename);

      // Upload to Firebase Storage in the background for cross-device rehydration
      console.log(`[CoverUpload] Uploading to Firebase Storage...`);
      const downloadUrl = await syncService.uploadCoverBlob(filename, thumbnail);
      console.log(`[CoverUpload] Firebase upload complete: ${downloadUrl ? 'success' : 'failed'}`);
      const coverSource = {
        type: 'user-custom' as const,
        url: downloadUrl || '',
        thumbHash,
        updatedAt: Date.now()
      };
      const currentMeta = enrichedMetadataRef.current[filename] || { title: filename.replace(/\.[^/.]+$/, ""), author: 'Desconocido' };
      const enrichedItem = { ...currentMeta, coverSource, svg: undefined };
      const newMetadata = { ...enrichedMetadataRef.current, [filename]: enrichedItem };
      setEnrichedMetadata(newMetadata);
      localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
      await coverDB.saveBookMetadata(filename, enrichedItem);
      await syncService.saveMetadata(newMetadata);
      setLibrary(prev => prev.map(book => 
        book.filename === filename ? { ...book, coverSource, svg: undefined } : book
      ));
    } catch (err) {
      console.error('[Cover Upload] Failed to process and sync cover thumbnail:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const removeBook = useCallback(async (filename: string) => {
    console.log(`[Library] Removing book: ${filename}`);
    
    // 1. Remove from local state immediately
    setLibrary(prev => prev.filter(b => b.filename !== filename));
    
    // 2. Track deletion so static books don't reappear on refresh
    const deletedRaw = localStorage.getItem('catreader_deleted_books');
    const deletedSet = new Set(deletedRaw ? JSON.parse(deletedRaw) : []);
    deletedSet.add(filename);
    localStorage.setItem('catreader_deleted_books', JSON.stringify([...deletedSet]));
    
    // 3. Clear localStorage metadata and progress
    const metaKey = 'catreader_enriched_metadata';
    const storedMeta = localStorage.getItem(metaKey);
    if (storedMeta) {
      try {
        const parsed = JSON.parse(storedMeta);
        delete parsed[filename];
        localStorage.setItem(metaKey, JSON.stringify(parsed));
      } catch (e) {}
    }
    localStorage.removeItem(`catreader_progress_${filename}`);
    
    // 4. Remove from IndexedDB
    try {
      await coverDB.deleteBook(filename);
      setCovers(prev => {
        const next = { ...prev };
        delete next[filename];
        return next;
      });
      setEnrichedMetadata(prev => {
        const next = { ...prev };
        delete next[filename];
        return next;
      });
    } catch (e) {
      console.error('[Library] Failed to delete from IndexedDB:', e);
    }
    
    // 5. Remove from cloud (best effort)
    try {
      await syncService.deleteBook(filename);
    } catch (e) {}
    
    showToast('Libro eliminado');
  }, [showToast]);

  const updateBookMetadata = async (filename: string, title: string, author: string, svg?: string, coverSource?: LibraryBook['coverSource']) => {
    console.log(`[Metadata] Updating ${filename}: title="${title}" author="${author}" hasCoverSource=${!!coverSource}`);
    const existingSource = coverSource || enrichedMetadataRef.current[filename]?.coverSource;
    const enrichedItem = { 
      title, 
      author, 
      svg: existingSource?.type === 'user-custom'
        ? undefined
        : (svg || enrichedMetadataRef.current[filename]?.svg),
      coverSource: existingSource
    };
    const newMetadata = { 
      ...enrichedMetadataRef.current, 
      [filename]: enrichedItem 
    };
    setEnrichedMetadata(newMetadata);
    localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
    try {
      await coverDB.saveBookMetadata(filename, enrichedItem);
    } catch (dbErr) {}
    await syncService.saveMetadata(newMetadata);
    setLibrary(prev => prev.map(book => 
      book.filename === filename ? {
        ...book,
        title,
        author,
        svg: existingSource?.type === 'user-custom' ? undefined : (svg || book.svg),
        coverSource: existingSource
      } : book
    ));
  };

  const enrichWithOpenLibrary = async () => {
    if (library.length === 0) return;
    setIsSyncing(true);
    const newMetadata = { ...enrichedMetadataRef.current };
    let changed = false;

    for (const book of library) {
      if (newMetadata[book.filename]?.title && newMetadata[book.filename]?.author) continue;
      try {
        const searchTitle = book.title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
        const query = encodeURIComponent(`${searchTitle} ${book.author || ''}`.trim());
        const res = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=1`);
        const data = await res.json();
        if (data.docs?.[0]) {
          const doc = data.docs[0];
          newMetadata[book.filename] = { ...newMetadata[book.filename], title: doc.title || book.title, author: doc.author_name?.[0] || book.author || '' };
          changed = true;
        }
      } catch (err) {}
    }

    if (changed) {
      setEnrichedMetadata(newMetadata);
      localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
      try {
        for (const [fname, meta] of Object.entries(newMetadata)) {
          await coverDB.saveBookMetadata(fname, meta);
        }
      } catch (dbErr) {}
      setLibrary(prev => prev.map(book => ({
        ...book,
        title: newMetadata[book.filename]?.title || book.title,
        author: newMetadata[book.filename]?.author || book.author
      })));
    }
    setIsSyncing(false);
    setAutoCoverIndex(0);
    setCoverScanKey(prev => prev + 1);
  };

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  useEffect(() => {
    if (library.length === 0 || isSyncing) return;
    const idleTimer = setTimeout(() => setIsIdle(true), 5000);
    return () => clearTimeout(idleTimer);
  }, [library.length, isSyncing]);

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
      const currentMeta = enrichedMetadataRef.current[book.filename];
      const needsEnrichment = !currentMeta || book.title === book.filename || !book.author;

      if (needsEnrichment && g_apiKey) {
        setEnrichmentProgress({ current: idx + 1, total: library.length, filename: book.filename });
        const enriched = await enrichBookWithGemini(book);
        if (enriched) {
          const existingSource = currentMeta?.coverSource;
          const enrichedWithSource = {
            ...enriched,
            coverSource: existingSource,
            svg: existingSource?.type === 'user-custom' ? undefined : enriched.svg,
          };
          
          const newMetadata = { ...enrichedMetadataRef.current, [book.filename]: enrichedWithSource };
          setEnrichedMetadata(newMetadata);
          localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
          try {
            await coverDB.saveBookMetadata(book.filename, enrichedWithSource);
          } catch (dbErr) {}
          await syncService.saveMetadata(newMetadata);
          setLibrary(prev => prev.map(b => b.filename === book.filename ? { ...b, ...enrichedWithSource } : b));
          
          if (enriched.svg && existingSource?.type !== 'user-custom') {
            try {
              const existingCover = await coverDB.getCover(book.filename);
              const isCustomImage = existingCover && (
                existingCover.startsWith('data:image/jpeg') ||
                existingCover.startsWith('data:image/png') ||
                existingCover.startsWith('data:image/webp') ||
                existingCover.startsWith('http')
              );
              if (!isCustomImage) {
                await coverDB.saveCover(book.filename, enriched.svg);
                setCovers(prev => ({ ...prev, [book.filename]: enriched.svg }));
              }
            } catch (e) {
              await coverDB.saveCover(book.filename, enriched.svg);
              setCovers(prev => ({ ...prev, [book.filename]: enriched.svg }));
            }
          }
        }
      }
      
      const hasCover = coversRef.current[book.filename] || (await coverDB.getCover(book.filename));
      const hasUserCustomSource = currentMeta?.coverSource?.type === 'user-custom';
      const hasOpenLibraryCover = currentMeta?.coverSource?.type === 'openlibrary';

      if (!hasCover && !hasUserCustomSource && !hasOpenLibraryCover) {
        setEnrichmentProgress({ current: idx + 1, total: library.length, filename: `Cover: ${book.title}` });
        await fetchEnhancedCover(book);
      }
      setAutoCoverIndex(prev => prev + 1);
      if (idx + 1 >= library.length) setEnrichmentProgress(null);
    }, 10000);
    return () => clearInterval(timer);
  }, [isIdle, library.length, coverScanKey, fetchEnhancedCover, enrichBookWithGemini]);

  return {
    library, setLibrary,
    enrichedMetadata,
    enrichedMetadataRef,
    covers, setCovers,
    isLoadingLibrary,
    enrichmentProgress,
    fetchLibrary,
    removeBook,
    enrichBookWithGemini,
    updateBookMetadata,
    handleCoverUpload,
    fetchEnhancedCover,
    bulkMagic,
    enrichWithOpenLibrary,
    setAutoCoverIndex,
    setCoverScanKey,
    savedBookCovers,
    markCoverAsSaved
  };
}
