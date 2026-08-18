import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function write(path, text) {
  fs.writeFileSync(path, text);
}

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Patch anchor missing: ${label}`);
  return text.replace(from, to);
}

// Tiny, synchronous local cover cache. Shelf-sized images are deliberately
// small enough that keeping the whole library in localStorage is cheap.
write('src/utils/coverThumbCache.ts', `export interface CoverThumbEntry {
  filename: string;
  url: string;
}

const STORAGE_KEY = 'catreader_cover_thumbs_v1';
const WIDTH = 48;
const HEIGHT = 72;
const MAX_CONCURRENT = 2;

let cache: Record<string, string> = {};
try {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) cache = JSON.parse(raw);
  }
} catch {
  cache = {};
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
const inflight = new Map<string, Promise<string | null>>();
const queue: Array<() => void> = [];
let active = 0;

function schedulePersist() {
  if (typeof localStorage === 'undefined') return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // Storage is only a fast-path; remote/IDB cover remains available.
    }
  }, 250);
}

function runNext() {
  while (active < MAX_CONCURRENT && queue.length) {
    active += 1;
    queue.shift()?.();
  }
}

function scheduled<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => {
      void job().then(resolve, reject).finally(() => {
        active -= 1;
        runNext();
      });
    });
    runNext();
  });
}

export function getCoverThumb(filename: string): string | undefined {
  return cache[filename];
}

export function getAllCoverThumbs(): Record<string, string> {
  return { ...cache };
}

export function setCoverThumb(filename: string, dataUrl: string) {
  if (!dataUrl.startsWith('data:image/')) return;
  cache[filename] = dataUrl;
  schedulePersist();
}

async function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    if ('decode' in image) await image.decode();
    else await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('cover image failed'));
    });
    return image;
  } finally {
    // revoke after the current task so decoded pixels remain available to canvas
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

async function createTinyThumb(url: string): Promise<string | null> {
  if (!url.startsWith('http')) return null;
  const response = await fetch(url, { cache: 'force-cache', mode: 'cors' });
  if (!response.ok) return null;
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) return null;
  const image = await imageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);
  try {
    return canvas.toDataURL('image/webp', 0.72);
  } catch {
    return canvas.toDataURL('image/jpeg', 0.72);
  }
}

export function cacheCoverThumbnail(filename: string, url: string): Promise<string | null> {
  const existing = cache[filename];
  if (existing) return Promise.resolve(existing);
  const current = inflight.get(filename);
  if (current) return current;

  const promise = scheduled(async () => {
    try {
      const thumb = await createTinyThumb(url);
      if (thumb) setCoverThumb(filename, thumb);
      return thumb;
    } catch {
      return null;
    }
  }).finally(() => inflight.delete(filename));

  inflight.set(filename, promise);
  return promise;
}

export function primeCoverThumbnails(
  entries: CoverThumbEntry[],
  onReady?: (filename: string, dataUrl: string) => void,
) {
  const start = () => {
    for (const { filename, url } of entries) {
      if (cache[filename] || !url?.startsWith('http')) continue;
      void cacheCoverThumbnail(filename, url).then((thumb) => {
        if (thumb) onReady?.(filename, thumb);
      });
    }
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(start, { timeout: 2500 });
  } else {
    setTimeout(start, 1200);
  }
}
`);

// Load local thumbnails synchronously before the first React shelf paint.
{
  const path = 'src/services/coverMem.ts';
  let text = read(path);
  text = replaceOnce(
    text,
    `/** HMR-safe cover map — survives Vite remount so library doesn’t flash SVG→IDB. */\n`,
    `/** HMR-safe cover map — survives Vite remount so library doesn’t flash SVG→IDB. */\n\nimport { getAllCoverThumbs } from '../utils/coverThumbCache';\n`,
    'coverMem thumbnail import',
  );
  text = replaceOnce(
    text,
    `export const coverMem: CoverMem = hot?.coverMem ?? { map: {}, hydrated: false };`,
    `export const coverMem: CoverMem = hot?.coverMem ?? { map: getAllCoverThumbs(), hydrated: false };`,
    'coverMem bootstrap',
  );
  write(path, text);
}

// Cache every real remote cover as a 48x72 data URI after the shelf is painted.
{
  const path = 'src/hooks/useLibrary.ts';
  let text = read(path);
  text = text.replace(`import { GoogleGenAI } from "@google/genai";\n`, '');
  text = text.replace(`import * as pdfjsBackground from 'pdfjs-dist/legacy/build/pdf.mjs';\n`, '');
  text = replaceOnce(
    text,
    `} from '../services/coverMem';\n`,
    `} from '../services/coverMem';\nimport { primeCoverThumbnails } from '../utils/coverThumbCache';\n`,
    'useLibrary thumb import',
  );
  text = replaceOnce(
    text,
    `      setIsLoadingLibrary(false);\n      setGlobalStatus(null);\n\n      // Load enriched metadata in the background`,
    `      setIsLoadingLibrary(false);\n      setGlobalStatus(null);\n\n      // Tiny shelf art is an offline UI asset, not content. Warm every known\n      // real cover only after first paint, with two requests max at a time.\n      primeCoverThumbnails(\n        visibleData.flatMap((book: LibraryBook) =>\n          book.coverSource?.url && ['openlibrary', 'google-books', 'wikimedia'].includes(book.coverSource.type)\n            ? [{ filename: book.filename, url: book.coverSource.url }]\n            : []\n        ),\n        (filename, thumb) => putCover(filename, thumb),\n      );\n\n      // Load enriched metadata in the background`,
    'background cover thumb warmup',
  );
  text = replaceOnce(
    text,
    `  }, [setGlobalStatus]);`,
    `  }, [setGlobalStatus, putCover]);`,
    'fetchLibrary dependencies',
  );
  text = replaceOnce(
    text,
    `      const data = new Uint8Array(await blob.arrayBuffer());\n      const loadingTask = (pdfjsBackground as any).getDocument({ data, useSystemFonts: true });`,
    `      const { getPdfJsRuntime } = await import('../utils/pdfRuntime');\n      const pdfjsBackground = await getPdfJsRuntime();\n      const data = new Uint8Array(await blob.arrayBuffer());\n      const loadingTask = (pdfjsBackground as any).getDocument({ data, useSystemFonts: true });`,
    'lazy background pdf runtime',
  );
  text = replaceOnce(
    text,
    `      const ai = new GoogleGenAI({ apiKey: g_apiKey });`,
    `      const { GoogleGenAI } = await import('@google/genai');\n      const ai = new GoogleGenAI({ apiKey: g_apiKey });`,
    'lazy Gemini useLibrary',
  );
  write(path, text);
}

// Book cards use local thumbnails when available and opportunistically persist
// newly resolved remote artwork without delaying image rendering.
{
  const path = 'src/components/BookCover.tsx';
  let text = read(path);
  text = replaceOnce(
    text,
    `import { invalidateAutoCover, resolveAutoCover, type AutoCoverResult } from '../utils/autoCover';\n`,
    `import { invalidateAutoCover, resolveAutoCover, type AutoCoverResult } from '../utils/autoCover';\nimport { cacheCoverThumbnail } from '../utils/coverThumbCache';\n`,
    'BookCover thumb import',
  );
  text = replaceOnce(
    text,
    `  const handleCoverLoadError = () => {`,
    `  const handleCoverLoad = () => {\n    const source = autoCover?.url || cover;\n    if (!source?.startsWith('http')) return;\n    void cacheCoverThumbnail(book.filename, source);\n  };\n\n  const handleCoverLoadError = () => {`,
    'BookCover load handler',
  );
  text = replaceOnce(
    text,
    `<img src={usableDisplayCover} alt={book.title} onError={handleCoverLoadError} className="w-full h-full object-cover rounded-r-md" />`,
    `<img src={usableDisplayCover} alt={book.title} loading="lazy" decoding="async" onLoad={handleCoverLoad} onError={handleCoverLoadError} className="w-full h-full object-cover rounded-r-md" />`,
    'BookCover async image',
  );
  write(path, text);
}

// PDF.js belongs to the reader path, never the library bootstrap path.
write('src/utils/pdfRuntime.ts', `let runtimePromise: Promise<any> | null = null;

export function getPdfJsRuntime(): Promise<any> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      (pdfjs as any).GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return runtimePromise;
}
`);

// ReaderView itself is lazy from App, so its react-pdf + worker imports cannot
// delay library paint. Configure the worker inside that lazy chunk.
{
  const path = 'src/components/ReaderView.tsx';
  let text = read(path);
  text = replaceOnce(
    text,
    `import { Document, Page } from 'react-pdf';`,
    `import { Document, Page, pdfjs as pdfjsLib } from 'react-pdf';\nimport pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';`,
    'ReaderView pdf imports',
  );
  text = replaceOnce(
    text,
    `import { applyInkVariance, stainsForPage } from '../utils/paperSoul';\n`,
    `import { applyInkVariance, stainsForPage } from '../utils/paperSoul';\n\npdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;\n`,
    'ReaderView worker setup',
  );
  write(path, text);
}

// Remove heavyweight PDF/Gemini imports from App's entry graph and lazy-load
// the entire reader screen only when a book is actually opened.
{
  const path = 'src/App.tsx';
  let text = read(path);
  text = text.replace(`import { Document, Page, pdfjs as pdfjsLib } from 'react-pdf';\n`, '');
  text = text.replace(`import { GoogleGenAI } from "@google/genai";\n`, '');
  text = text.replace(`import * as pdfjsBackground from 'pdfjs-dist/legacy/build/pdf.mjs';\n`, '');
  text = text.replace(`import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';\n\n// Keep PDF.js fully local/offline. Remote workers make first-open latency network-dependent.\npdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;\n(pdfjsBackground as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;\n`, '');
  text = text.replace(`import { ReaderView } from './components/ReaderView';\n`, '');
  text = replaceOnce(
    text,
    `import { debugError, debugInfo, debugWarn, installGlobalDebugCapture } from './utils/debugLog';\n`,
    `import { debugError, debugInfo, debugWarn, installGlobalDebugCapture } from './utils/debugLog';\n\nconst ReaderView = React.lazy(() =>\n  import('./components/ReaderView').then((module) => ({ default: module.ReaderView }))\n);\n`,
    'lazy ReaderView declaration',
  );
  text = replaceOnce(
    text,
    `      const ai = new GoogleGenAI({ apiKey: g_apiKey });`,
    `      const { GoogleGenAI } = await import('@google/genai');\n      const ai = new GoogleGenAI({ apiKey: g_apiKey });`,
    'lazy Gemini App',
  );
  text = replaceOnce(
    text,
    `      const data = new Uint8Array(await fileOrBlob.arrayBuffer());\n      const loadingTask = (pdfjsBackground as any).getDocument({ data, useSystemFonts: true });`,
    `      const { getPdfJsRuntime } = await import('./utils/pdfRuntime');\n      const pdfjsBackground = await getPdfJsRuntime();\n      const data = new Uint8Array(await fileOrBlob.arrayBuffer());\n      const loadingTask = (pdfjsBackground as any).getDocument({ data, useSystemFonts: true });`,
    'lazy App pdf runtime',
  );

  const readerStart = text.indexOf('          <ReaderView ');
  if (readerStart < 0) throw new Error('ReaderView JSX start not found');
  const readerEndMarker = '\n          />';
  const readerEnd = text.indexOf(readerEndMarker, readerStart);
  if (readerEnd < 0) throw new Error('ReaderView JSX end not found');
  text = text.slice(0, readerStart)
    + `          <React.Suspense fallback={<div className="min-h-full grid place-items-center text-stone-500 text-xs font-mono">Cargando lector…</div>}>\n`
    + text.slice(readerStart)
    + text.slice(0, 0);
  // Re-find after prefix insertion and close Suspense immediately after ReaderView.
  const shiftedStart = text.indexOf('          <ReaderView ');
  const shiftedEnd = text.indexOf(readerEndMarker, shiftedStart) + readerEndMarker.length;
  text = text.slice(0, shiftedEnd) + `\n          </React.Suspense>` + text.slice(shiftedEnd);

  write(path, text);
}

// Production books.json must not ship legacy SVG cover payloads that the shelf
// explicitly ignores. This removes a large parse/download cost on every boot.
{
  const path = 'scripts/generate-library.js';
  let text = read(path);
  text = replaceOnce(
    text,
    `      author: existing?.author,\n      svg: existing?.svg,\n`,
    `      author: existing?.author,\n      // Legacy synthetic SVG covers are intentionally omitted from the runtime manifest.\n`,
    'strip svg from runtime manifest',
  );
  write(path, text);
}

// Let Rollup preserve lazy boundaries instead of forcing every third-party
// package into a shared vendor mega-chunk that the shelf has to download.
{
  const path = 'vite.config.ts';
  let text = read(path);
  const from = `    build: {\n      rollupOptions: {\n        output: {\n          manualChunks(id) {\n            if (id.includes('node_modules')) {\n              if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';\n              if (id.includes('motion') || id.includes('framer-motion')) return 'vendor-motion';\n              if (id.includes('lucide-react')) return 'vendor-lucide';\n              if (id.includes('react')) return 'vendor-react';\n              return 'vendor';\n            }\n          },\n        },\n      },\n      chunkSizeWarningLimit: 1000,\n    },`;
  const to = `    build: {\n      // Default Rollup chunking preserves React.lazy()/dynamic-import boundaries.\n      // A manual vendor mega-chunk made PDF.js/Gemini part of library startup.\n      chunkSizeWarningLimit: 1000,\n    },`;
  text = replaceOnce(text, from, to, 'remove vendor mega-chunks');
  write(path, text);
}

console.log('instant shelf boot patch applied');
