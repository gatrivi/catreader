import fs from 'node:fs';

function patch(path, replacements) {
  const raw = fs.readFileSync(path, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let text = raw.replace(/\r\n/g, '\n');
  for (const [from, to] of replacements) {
    if (!text.includes(from)) {
      throw new Error(`Patch anchor not found in ${path}: ${from.slice(0, 100)}`);
    }
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text);
}

patch('src/App.tsx', [[
`  const getBookBlob = (book: LibraryBook): Promise<Blob> => {
    const existing = bookBlobPromisesRef.current.get(book.filename);
    if (existing) return existing;

    const promise = (async () => {
      const cached = await coverDB.getBookContent(book.filename);
      if (cached && cached.size > 0) return cached;

      const baseUrl = import.meta.env.BASE_URL || '/';
      const booksDirPath = baseUrl.endsWith('/') ? \`${'${baseUrl}'}books/\` : \`${'${baseUrl}'}/books/\`;
      const fetchUrl = \`${'${booksDirPath}'}${'${encodeURIComponent(book.filename)}'}\`;
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(\`Server returned ${'${response.status}'}\`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('Fetched blob is empty (0 bytes)');
      void coverDB.saveBookContent(book.filename, blob);
      return blob;
    })();

    bookBlobPromisesRef.current.set(book.filename, promise);
    promise.catch(() => bookBlobPromisesRef.current.delete(book.filename));
    return promise;
  };`,
`  const isUsableBookBlob = async (blob: Blob | null, book: LibraryBook): Promise<boolean> => {
    if (!blob || blob.size === 0) return false;
    if (book.type.toLowerCase() !== 'pdf') return true;
    if (blob.type.toLowerCase().includes('pdf')) return true;
    try {
      return (await blob.slice(0, 5).text()) === '%PDF-';
    } catch {
      return false;
    }
  };

  const getBookBlob = (book: LibraryBook): Promise<Blob> => {
    const existing = bookBlobPromisesRef.current.get(book.filename);
    if (existing) return existing;

    const promise = (async () => {
      const cached = await coverDB.getBookContent(book.filename);
      if (await isUsableBookBlob(cached, book)) return cached as Blob;
      if (cached) {
        console.warn('[Reader] Dropping invalid cached book:', book.filename, cached.type, cached.size);
        await coverDB.deleteBookContent(book.filename).catch(() => {});
      }

      const baseUrl = import.meta.env.BASE_URL || '/';
      const booksDirPath = baseUrl.endsWith('/') ? \`${'${baseUrl}'}books/\` : \`${'${baseUrl}'}/books/\`;
      const fetchUrl = \`${'${booksDirPath}'}${'${encodeURIComponent(book.filename)}'}\`;
      const candidates = [fetchUrl, \`${'${fetchUrl}'}?v=${'${encodeURIComponent(APP_VERSION)}'}\`];
      let lastError: unknown = null;

      for (let attempt = 0; attempt < candidates.length; attempt += 1) {
        try {
          const response = await fetch(candidates[attempt], { cache: attempt === 0 ? 'default' : 'reload' });
          if (!response.ok) throw new Error(\`Server returned ${'${response.status}'}\`);
          const blob = await response.blob();
          if (!(await isUsableBookBlob(blob, book))) {
            throw new Error(\`Invalid ${'${book.type.toUpperCase()}'} response (${ '${blob.type || "unknown type"}' }, ${'${blob.size}'} bytes)\`);
          }
          void coverDB.saveBookContent(book.filename, blob);
          return blob;
        } catch (err) {
          lastError = err;
          if (attempt === 0) console.warn('[Reader] Book fetch retry:', book.filename, err);
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Failed to fetch book');
    })();

    bookBlobPromisesRef.current.set(book.filename, promise);
    promise.catch(() => bookBlobPromisesRef.current.delete(book.filename));
    return promise;
  };`
], [
`    } catch (err: any) {
      if (requestId !== openRequestRef.current) return;
      console.error('[Reader] Failed to open book:', err);
      setGlobalError({ message: 'No pudimos abrir el libro', details: err.message });
      showToast('Error al abrir el libro.');
    }
    if (requestId !== openRequestRef.current) return;`,
`    } catch (err: any) {
      if (requestId !== openRequestRef.current) return;
      console.error('[Reader] Failed to open book:', err);
      // A failed network request must return the user to a usable shelf, not
      // leave a fake loading state running for another five seconds.
      setGlobalError(null);
      setFileUrl(null);
      setFileName('');
      setIsLoaded(true);
      setIsRestoring(false);
      restoreTargetPageRef.current = null;
      modeSwitchPageRef.current = null;
      localStorage.removeItem('catreader_last_book');
      showToast('No se pudo descargar el libro. Probá de nuevo.');
      return;
    }
    if (requestId !== openRequestRef.current) return;`
]]);

patch('src/hooks/useLibrary.ts', [[
`      const visibleData = filterDeletedBooks(data as LibraryBook[], deletedSet);
      // Keep spinner until covers+library commit together (no early SVG paint)
      setGlobalStatus('Cargando portadas...');`,
`      const visibleData = filterDeletedBooks(data as LibraryBook[], deletedSet);

      // Critical path: paint the shelf as soon as books.json arrives. Covers and
      // cloud metadata are enrichment, not prerequisites for using the app.
      // Mark covers hydrated so BookCover renders its title/author fallback
      // instead of a wall of blank shimmer tiles while IndexedDB is scanned.
      setLibrary(visibleData.map((book: LibraryBook) => ({ ...book, svg: undefined })));
      setCovers({ ...coverMem.map });
      setCoversHydrated(true);
      setIsLoadingLibrary(false);
      setGlobalStatus(null);`
]]);

patch('vite.config.ts', [[
`          // Use runtime caching for books instead
          runtimeCaching: [
            {
              urlPattern: /\\/books\\/.*\\.pdf$/,
              handler: 'CacheFirst',`,
`          // Use runtime caching for books instead. EPUB/TXT should be just as
          // resilient offline as PDFs once the user has opened them.
          runtimeCaching: [
            {
              urlPattern: /\\/books\\/.*\\.(pdf|epub|txt)$/i,
              handler: 'CacheFirst',`
]]);

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
packageJson.dependencies['vite-plugin-pwa'] = packageJson.devDependencies['vite-plugin-pwa'];
delete packageJson.devDependencies['vite-plugin-pwa'];
fs.writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const root = lock.packages[''];
root.dependencies['vite-plugin-pwa'] = root.devDependencies['vite-plugin-pwa'];
delete root.devDependencies['vite-plugin-pwa'];
fs.writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

console.log('critical hardening patch applied');
