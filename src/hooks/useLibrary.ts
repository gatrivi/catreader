import { useState, useEffect, useCallback, useRef } from 'react';
import { syncService } from '../services/syncService';
import { coverDB } from '../services/db';
import { GoogleGenAI } from "@google/genai";
import * as pdfjsBackground from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createThumbnail } from '../utils/image';
import { filterDeletedBooks } from '../utils/shelves';
import { shouldSkipCoverFetch, isUserCustomCover } from '../utils/covers';
import {
  coverMem,
  coverMemMerge,
  coverMemMarkHydrated,
  coverMemSet,
} from '../services/coverMem';

export interface LibraryBook {
  id: string;
  title: string;
  author?: string;
  filename: string;
  type: string;
  svg?: string;
  /** Has a pre-baked audiobook available (cassette icon on cover) */
  audio?: boolean;
  /** CatTS KEEP_* book id for GET /books/{id} */
  cattsBookId?: string;
  /** Path to paper-manifest.json when Paper Soul bake exists */
  paper?: string;
  coverSource?: {
    type: 'user-custom' | 'ai-generated' | 'openlibrary' | 'google-books' | 'wikimedia' | 'bundled';
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
  const [covers, setCovers] = useState<Record<string, string>>(() => ({ ...coverMem.map }));
  const [coversHydrated, setCoversHydrated] = useState(() => coverMem.hydrated);
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

  const putCover = useCallback((filename: string, cover: string) => {
    coverMemSet(filename, cover);
    setCovers((prev) => {
      const next = { ...prev, [filename]: cover };
      coverMemMerge(next);
      return next;
    });
  }, []);

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
      const deletedSet = new Set<string>(deletedRaw ? JSON.parse(deletedRaw) : []);
      const visibleData = filterDeletedBooks(data as LibraryBook[], deletedSet);
      // Keep spinner until covers+library commit together (no early SVG paint)
      setGlobalStatus('Cargando portadas...');

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

          // Cloud AFTER local paint — never block shelf (2.5s cap). Prefer local coverSource.
          const cloudPromise = (async () => {
            try {
              const cloudMetadata = await Promise.race([
                syncService.loadMetadata(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
              ]);
              if (!cloudMetadata) return null;
              const merged = { ...metadata };
              for (const [key, cloudBookMeta] of Object.entries(cloudMetadata)) {
                const localBookMeta = merged[key];
                if (localBookMeta) {
                  merged[key] = {
                    ...localBookMeta,
                    ...cloudBookMeta,
                    coverSource: localBookMeta.coverSource || cloudBookMeta.coverSource,
                    svg: localBookMeta.svg || cloudBookMeta.svg,
                  };
                } else {
                  merged[key] = cloudBookMeta;
                }
              }
              return merged;
            } catch {
              return null;
            }
          })();

          if (Object.keys(metadata).length > 0) {
            setEnrichedMetadata(metadata);
            localStorage.setItem('catreader_enriched_metadata', JSON.stringify(metadata));
            try {
              for (const [fname, meta] of Object.entries(metadata)) {
                await coverDB.saveBookMetadata(fname, meta);
              }
            } catch (fillErr) {}
          }

          // Build complete library including manually uploaded books from IndexedDB
          const staticFilenames = new Set(visibleData.map((b: LibraryBook) => b.filename));
          const customBooks: LibraryBook[] = [];
          for (const [fname, meta] of Object.entries(metadata)) {
            if (!staticFilenames.has(fname) && !deletedSet.has(fname)) {
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

          // ponytail: enrich visibleData only — mapping raw `data` resurrected deleted books
          const enriched = visibleData.map((book: LibraryBook) => {
            const meta = metadata[book.filename];
            const src = meta?.coverSource;
            // Suppress svg flash whenever we have a declared cover source (incl. bundled/custom)
            const hideBundledSvg = !!src?.type && src.type !== 'ai-generated';
            return {
              ...book,
              title: meta?.title || book.title,
              author: meta?.author || '',
              svg: hideBundledSvg ? undefined : (meta?.svg ?? book.svg),
              coverSource: src || undefined
            };
          });

          const withSvg = filterDeletedBooks([...enriched, ...customBooks], deletedSet);
          const allBooks = withSvg.map((b) => ({
            ...b,
            // covers[] is SoT after hydrate — strip svg so BookCover can't dual-paint
            svg: undefined as string | undefined,
          }));

          // Hydrate covers: IDB → cloud URL → seed bundled svg once
          console.log(`[Covers] Hydrating covers for ${allBooks.length} books...`);
          const loadedCovers: Record<string, string> = { ...coverMem.map };
          const metaUpdates: Record<string, { title: string; author: string; svg?: string; coverSource?: any }> = { ...metadata };

          for (const book of allBooks) {
            const rawBook = withSvg.find((b) => b.filename === book.filename) || book;
            let cover = loadedCovers[book.filename] || (await coverDB.getCover(book.filename));
            if (cover) {
              loadedCovers[book.filename] = cover;
              // Stamp source so idle never replaces orphan IDB covers
              const prev = metaUpdates[book.filename] || {
                title: book.title,
                author: book.author || '',
              };
              if (!prev.coverSource?.type) {
                const inferred =
                  cover.startsWith('http')
                    ? { type: 'openlibrary' as const, url: cover, updatedAt: Date.now() }
                    : cover.includes('<svg') || cover.startsWith('data:image/svg')
                      ? { type: 'bundled' as const, updatedAt: Date.now() }
                      : { type: 'user-custom' as const, updatedAt: Date.now() };
                metaUpdates[book.filename] = { ...prev, coverSource: inferred };
              }
              continue;
            }

            const src = rawBook.coverSource || metaUpdates[book.filename]?.coverSource;
            if (src?.type === 'user-custom' && src.url) {
              try {
                const r = await fetch(src.url);
                if (r.ok) {
                  const blob = await r.blob();
                  cover = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  });
                  await coverDB.saveCover(book.filename, cover);
                  loadedCovers[book.filename] = cover;
                  continue;
                }
              } catch (err) {
                console.error('[Cover Sync] Failed to lazy download cover:', err);
              }
            }

            if (src?.url && (src.type === 'openlibrary' || src.type === 'google-books' || src.type === 'wikimedia')) {
              loadedCovers[book.filename] = src.url;
              await coverDB.saveCover(book.filename, src.url);
              continue;
            }

            const bundledSvg = rawBook.svg || metaUpdates[book.filename]?.svg;
            if (bundledSvg && bundledSvg.includes('<svg')) {
              await coverDB.saveCover(book.filename, bundledSvg);
              loadedCovers[book.filename] = bundledSvg;
              const prev = metaUpdates[book.filename] || {
                title: book.title,
                author: book.author || '',
                svg: bundledSvg,
              };
              metaUpdates[book.filename] = {
                ...prev,
                coverSource: prev.coverSource?.type
                  ? prev.coverSource
                  : { type: 'bundled', updatedAt: Date.now() },
              };
            }
          }

          coverMemMerge(loadedCovers);
          coverMemMarkHydrated();
          // Atomic: covers + library + hydrated in one paint window
          setCovers({ ...coverMem.map });
          setCoversHydrated(true);
          if (Object.keys(metaUpdates).length) {
            setEnrichedMetadata(metaUpdates);
            try {
              for (const [fname, meta] of Object.entries(metaUpdates)) {
                await coverDB.saveBookMetadata(fname, meta);
              }
            } catch {}
          }
          setLibrary(allBooks.map((b) => ({
            ...b,
            coverSource: metaUpdates[b.filename]?.coverSource || b.coverSource,
          })));
          setIsLoadingLibrary(false);
          setGlobalStatus(null);

          // Background cloud: titles/custom books only — never replace existing covers
          void cloudPromise.then(async (merged) => {
            if (!merged) return;
            setEnrichedMetadata((prev) => {
              const next = { ...prev };
              for (const [k, m] of Object.entries(merged)) {
                next[k] = {
                  ...next[k],
                  ...m,
                  coverSource: next[k]?.coverSource || m.coverSource,
                };
              }
              return next;
            });
            setLibrary((prev) => {
              const byId = new Set(prev.map((b) => b.filename));
              const extras: LibraryBook[] = [];
              for (const [fname, m] of Object.entries(merged)) {
                if (byId.has(fname) || deletedSet.has(fname)) continue;
                if (visibleData.some((b) => b.filename === fname)) continue;
                extras.push({
                  id: fname,
                  filename: fname,
                  type: fname.split('.').pop()?.toLowerCase() || 'pdf',
                  title: m.title || fname,
                  author: m.author || 'Desconocido',
                  coverSource: m.coverSource,
                });
              }
              if (!extras.length) {
                return prev.map((b) => {
                  const m = merged[b.filename];
                  if (!m) return b;
                  return {
                    ...b,
                    title: m.title || b.title,
                    author: m.author || b.author,
                    coverSource: b.coverSource || m.coverSource,
                  };
                });
              }
              return [
                ...prev.map((b) => {
                  const m = merged[b.filename];
                  if (!m) return b;
                  return {
                    ...b,
                    title: m.title || b.title,
                    author: m.author || b.author,
                    coverSource: b.coverSource || m.coverSource,
                  };
                }),
                ...extras,
              ];
            });
          });
        } catch (mErr) {
          console.warn('Metadata enrichment skipped:', mErr);

          const loadedCovers: Record<string, string> = { ...coverMem.map };
          for (const book of data) {
            const cover = await coverDB.getCover(book.filename);
            if (cover) loadedCovers[book.filename] = cover;
            else if ((book as LibraryBook).svg?.includes('<svg')) {
              const svg = (book as LibraryBook).svg as string;
              await coverDB.saveCover(book.filename, svg);
              loadedCovers[book.filename] = svg;
            }
          }
          coverMemMerge(loadedCovers);
          coverMemMarkHydrated();
          setCovers({ ...coverMem.map });
          setCoversHydrated(true);
          setIsLoadingLibrary(false);
          setGlobalStatus(null);
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
      putCover(book.filename, base64Image);
    }
  };

  /**
   * Fetches enhanced covers from various APIs.
   */
  const fetchEnhancedCover = useCallback(async (book: LibraryBook, forceAI = false) => {
    console.log(`[Cover] fetchEnhancedCover called for ${book.title}, forceAI=${forceAI}`);
    const meta = enrichedMetadataRef.current[book.filename];
    let existingCover: string | null = null;
    try {
      existingCover = await coverDB.getCover(book.filename);
    } catch (e) {
      console.warn('[Cover] Error checking existing cover:', e);
    }

    if (shouldSkipCoverFetch({
      force: forceAI,
      existingCover,
      coverSource: meta?.coverSource,
    })) {
      console.log(`[Cover] Skipping fetch — existing cover sacred for: ${book.title}`);
      return;
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
          putCover(book.filename, secureThumbnail);
          const src = { type: 'google-books' as const, url: secureThumbnail, updatedAt: Date.now() };
          const prev = enrichedMetadataRef.current[book.filename] || { title: book.title, author: book.author || '' };
          const next = { ...prev, coverSource: src };
          const newMetadata = { ...enrichedMetadataRef.current, [book.filename]: next };
          setEnrichedMetadata(newMetadata);
          try { await coverDB.saveBookMetadata(book.filename, next); } catch {}
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
            putCover(book.filename, olCoverUrl);
            const src = { type: 'openlibrary' as const, url: olCoverUrl, updatedAt: Date.now() };
            const prev = enrichedMetadataRef.current[book.filename] || { title: book.title, author: book.author || '' };
            const next = { ...prev, coverSource: src };
            const newMetadata = { ...enrichedMetadataRef.current, [book.filename]: next };
            setEnrichedMetadata(newMetadata);
            try { await coverDB.saveBookMetadata(book.filename, next); } catch {}
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
        putCover(book.filename, svg);
        return;
      }

      const g_apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY || '';
      if (g_apiKey) {
        const enriched = await enrichBookWithGemini(book);
        if (enriched && enriched.svg) {
           await coverDB.saveCover(book.filename, enriched.svg);
           putCover(book.filename, enriched.svg);
            const withSrc = {
              ...enriched,
              coverSource: enrichedMetadataRef.current[book.filename]?.coverSource || {
                type: 'ai-generated' as const,
                updatedAt: Date.now(),
              },
            };
            const newMetadata = { ...enrichedMetadataRef.current, [book.filename]: withSrc };
            setEnrichedMetadata(newMetadata);
            localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
            try {
              await coverDB.saveBookMetadata(book.filename, withSrc);
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
  }, [enrichBookWithGemini, setIdentifyingBookId, putCover]);

  const handleCoverUpload = async (filename: string, file: File) => {
    console.log(`[CoverUpload] Starting upload for ${filename}`);
    setIsSyncing(true);
    try {
      const { thumbnail, thumbHash } = await createThumbnail(file);
      console.log(`[CoverUpload] Thumbnail created, size: ${thumbnail.length}`);
      await coverDB.saveCover(filename, thumbnail);
      console.log(`[CoverUpload] Saved to IndexedDB`);
      putCover(filename, thumbnail);
      markCoverAsSaved(filename);

      // Upload to Firebase Storage with retry — empty url = other devices lose the cover
      let downloadUrl: string | null = null;
      for (let attempt = 0; attempt < 3 && !downloadUrl; attempt++) {
        console.log(`[CoverUpload] Firebase Storage attempt ${attempt + 1}...`);
        downloadUrl = await syncService.uploadCoverBlob(filename, thumbnail);
      }
      if (!downloadUrl) {
        showToast('Portada local OK — sync cloud falló (reintentá)');
        console.error('[CoverUpload] Storage upload failed after retries');
      } else {
        console.log(`[CoverUpload] Firebase upload complete`);
      }
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
      if (downloadUrl) showToast('Portada guardada en la nube');
    } catch (err) {
      console.error('[Cover Upload] Failed to process and sync cover thumbnail:', err);
      showToast('Error al guardar portada');
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
        delete coverMem.map[filename];
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
          
          if (enriched.svg && !isUserCustomCover(existingSource)) {
            try {
              const existingCover =
                coversRef.current[book.filename] || (await coverDB.getCover(book.filename));
              if (shouldSkipCoverFetch({ existingCover, coverSource: existingSource })) {
                // keep sacred cover
              } else {
                await coverDB.saveCover(book.filename, enriched.svg);
                putCover(book.filename, enriched.svg);
              }
            } catch (e) {
              await coverDB.saveCover(book.filename, enriched.svg);
              putCover(book.filename, enriched.svg);
            }
          }
        }
      }
      
      const hasCover = coversRef.current[book.filename] || coverMem.map[book.filename] || (await coverDB.getCover(book.filename));
      const currentSource = enrichedMetadataRef.current[book.filename]?.coverSource;

      if (!shouldSkipCoverFetch({ existingCover: hasCover, coverSource: currentSource })) {
        setEnrichmentProgress({ current: idx + 1, total: library.length, filename: `Cover: ${book.title}` });
        await fetchEnhancedCover(book);
      }
      setAutoCoverIndex(prev => prev + 1);
      if (idx + 1 >= library.length) setEnrichmentProgress(null);
    }, 10000);
    return () => clearInterval(timer);
  }, [isIdle, library.length, coverScanKey, fetchEnhancedCover, enrichBookWithGemini, putCover]);

  return {
    library, setLibrary,
    enrichedMetadata,
    enrichedMetadataRef,
    covers, setCovers,
    coversHydrated,
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
