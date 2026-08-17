import fs from 'node:fs';

function patch(path, from, to) {
  const raw = fs.readFileSync(path, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let text = raw.replace(/\r\n/g, '\n');
  if (text.includes(to)) return;
  if (!text.includes(from)) throw new Error(`Patch anchor not found in ${path}: ${from.slice(0, 140)}`);
  text = text.replace(from, to);
  fs.writeFileSync(path, eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text);
}

function patchRegex(path, pattern, replacement) {
  const raw = fs.readFileSync(path, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let text = raw.replace(/\r\n/g, '\n');
  if (text.includes(replacement)) return;
  if (!pattern.test(text)) throw new Error(`Regex patch anchor not found in ${path}: ${pattern}`);
  text = text.replace(pattern, replacement);
  fs.writeFileSync(path, eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text);
}

patch(
  'src/App.tsx',
  `import { shouldOpenTextFirst } from './utils/openMode';`,
  `import { shouldOpenTextFirst } from './utils/openMode';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { debugError, debugInfo, debugWarn, installGlobalDebugCapture } from './utils/debugLog';`,
);

patch(
  'src/App.tsx',
  `  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isSimplified, setIsSimplified] = useState(localStorage.getItem('catreader_simplified') === 'true');`,
  `  const [showDiagnostics, setShowDiagnostics] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1');
  useEffect(() => installGlobalDebugCapture(), []);
  const [isSimplified, setIsSimplified] = useState(localStorage.getItem('catreader_simplified') === 'true');`,
);

patch(
  'src/App.tsx',
  `      const cached = await coverDB.getBookContent(book.filename);
      if (await isUsableBookBlob(cached, book)) return cached as Blob;
      if (cached) {
        console.warn('[Reader] Dropping invalid cached book:', book.filename, cached.type, cached.size);`,
  `      const cached = await coverDB.getBookContent(book.filename);
      if (await isUsableBookBlob(cached, book)) {
        debugInfo('book-cache', 'hit', { filename: book.filename, size: cached?.size, type: cached?.type });
        return cached as Blob;
      }
      if (cached) {
        debugWarn('book-cache', 'dropping invalid cached book', { filename: book.filename, type: cached.type, size: cached.size });`,
);

patch(
  'src/App.tsx',
  `      for (let attempt = 0; attempt < candidates.length; attempt += 1) {
        try {
          const response = await fetch(candidates[attempt], { cache: attempt === 0 ? 'default' : 'reload' });`,
  `      for (let attempt = 0; attempt < candidates.length; attempt += 1) {
        try {
          debugInfo('book-fetch', 'request', { filename: book.filename, attempt: attempt + 1, url: candidates[attempt] });
          const response = await fetch(candidates[attempt], { cache: attempt === 0 ? 'default' : 'reload' });`,
);

patch(
  'src/App.tsx',
  `          void coverDB.saveBookContent(book.filename, blob);
          return blob;
        } catch (err) {
          lastError = err;
          if (attempt === 0) console.warn('[Reader] Book fetch retry:', book.filename, err);
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Failed to fetch book');`,
  `          void coverDB.saveBookContent(book.filename, blob);
          debugInfo('book-fetch', 'success', { filename: book.filename, attempt: attempt + 1, size: blob.size, type: blob.type });
          return blob;
        } catch (err) {
          lastError = err;
          debugWarn('book-fetch', 'attempt failed', { filename: book.filename, attempt: attempt + 1, error: err instanceof Error ? err.message : String(err) });
        }
      }

      debugError('book-fetch', 'all attempts failed', { filename: book.filename, error: lastError instanceof Error ? lastError.message : String(lastError) });
      throw lastError instanceof Error ? lastError : new Error('Failed to fetch book');`,
);

patch(
  'src/App.tsx',
  `    console.log(\`[Reader] Opening book: \${filename}\`);`,
  `    debugInfo('reader', 'open requested', { filename, type: book.type, forcedPage: forcePage ?? fallbackPage ?? null });`,
);

patch(
  'src/App.tsx',
  `    const textFirstPdf = shouldOpenTextFirst(book.type, preferReaderMode);
    setFileName(filename);`,
  `    const textFirstPdf = shouldOpenTextFirst(book.type, preferReaderMode);
    debugInfo('reader', 'open mode selected', { filename, textFirstPdf, preferReaderMode: preferReaderMode ?? null });
    setFileName(filename);`,
);

patch(
  'src/App.tsx',
  `      }).catch((err) => {
        console.warn('[Reader] Background PDF warm failed:', err);`,
  `      }).catch((err) => {
        debugWarn('reader', 'background PDF warm failed', { filename, error: err instanceof Error ? err.message : String(err) });`,
);

patch(
  'src/App.tsx',
  `      console.error('[Reader] Failed to open book:', err);`,
  `      debugError('reader', 'failed to open book', { filename, error: err instanceof Error ? err.message : String(err) });`,
);

patch(
  'src/App.tsx',
  `      <button onClick={() => setShowDiagnostics(true)} className="fixed top-2 right-4 z-40 text-[10px] font-mono opacity-30 select-none hover:opacity-100 transition-opacity uppercase tracking-[0.2em] cursor-help">{APP_VERSION}</button>`,
  `      <button
        onClick={() => setShowDiagnostics(true)}
        className="fixed top-1 right-2 z-40 min-w-11 min-h-11 px-2 grid place-items-center text-[10px] font-mono opacity-45 select-none hover:opacity-100 focus:opacity-100 transition-opacity uppercase tracking-[0.12em] cursor-help"
        aria-label="Abrir diagnóstico"
        title="Diagnóstico"
      >{APP_VERSION}</button>`,
);

patchRegex(
  'src/App.tsx',
  /\s*<AnimatePresence>\{showDiagnostics && \([\s\S]*?<\/AnimatePresence>\s*\n\s*<AnimatePresence>\{globalStatus/,
  `
      <DiagnosticsPanel
        open={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        appVersion={APP_VERSION}
        device={getDeviceCategory()}
        library={library}
        covers={covers}
        coversHydrated={coversHydrated}
        libraryLoading={isLoadingLibrary}
        activeBook={fileName}
        fileType={fileType}
        readerMode={isReaderMode}
        isLoaded={isLoaded}
        isRestoring={isRestoring}
        pageNumber={pageNumber}
        numPages={numPages}
        pwaStatus={pwaUpdate.status}
        isSyncing={isSyncing}
      />

      <AnimatePresence>{globalStatus`,
);

patch(
  'src/components/BookCover.tsx',
  `import { SadMonkIcon } from './SadMonkIcon';`,
  `import { SadMonkIcon } from './SadMonkIcon';
import { debugWarn } from '../utils/debugLog';`,
);

patch(
  'src/components/BookCover.tsx',
  `    coverSource?: {
      type: 'user-custom' | 'ai-generated' | 'openlibrary' | 'wikimedia';
    };`,
  `    coverSource?: {
      type: 'user-custom' | 'ai-generated' | 'openlibrary' | 'google-books' | 'wikimedia' | 'bundled';
      url?: string;
    };`,
);

patch(
  'src/components/BookCover.tsx',
  `  React.useEffect(() => {
    console.log(\`[BookCover] Mount/update \${book.filename}: cover=\${!!cover} source=\${cover?.startsWith('data:') ? 'dataURL' : cover?.startsWith('http') ? 'url' : cover ? 'svg/other' : 'none'}\`);
  }, [book.filename, cover]);
  const displayCover = React.useMemo(() => {`,
  `  const handleCoverLoadError = () => {
    setCoverLoadFailed(true);
    debugWarn('cover', 'image failed to load', {
      filename: book.filename,
      source: book.coverSource?.type || 'unknown',
      url: cover?.startsWith('http') ? cover.slice(0, 500) : undefined,
    });
  };

  const displayCover = React.useMemo(() => {`,
);

patch(
  'src/components/BookCover.tsx',
  `<img src={usableDisplayCover} alt={book.title} onError={() => setCoverLoadFailed(true)} className="w-full h-full object-cover rounded-r-md" />`,
  `<img src={usableDisplayCover} alt={book.title} onError={handleCoverLoadError} className="w-full h-full object-cover rounded-r-md" />`,
);

patch(
  'package.json',
  `    "test": "vitest run",
    "dev:local": "tsx server.ts"`,
  `    "test": "vitest run",
    "test:critical": "node scripts/critical-smoke.mjs",
    "dev:local": "tsx server.ts"`,
);

console.log('Stability/debug patch applied.');
