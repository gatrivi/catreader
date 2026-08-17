import fs from 'node:fs';

function patch(path, from, to) {
  const raw = fs.readFileSync(path, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let text = raw.replace(/\r\n/g, '\n');
  if (text.includes(to)) return;
  if (!text.includes(from)) throw new Error(`Patch anchor not found in ${path}: ${from.slice(0, 120)}`);
  text = text.replace(from, to);
  fs.writeFileSync(path, eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text);
}

patch(
  'src/hooks/useLibrary.ts',
  "import { shouldSkipCoverFetch, isUserCustomCover } from '../utils/covers';",
  "import { preferredCoverSource, shouldReplaceStoredCover, shouldSkipCoverFetch, isUserCustomCover } from '../utils/covers';",
);

patch(
  'src/hooks/useLibrary.ts',
  `      setLibrary(visibleData.map((book: LibraryBook) => ({ ...book, svg: undefined })));
      setCovers({ ...coverMem.map });
      setCoversHydrated(true);`,
  `      const initialCovers: Record<string, string> = { ...coverMem.map };
      for (const book of visibleData) {
        const src = book.coverSource;
        if (!initialCovers[book.filename] && src?.url && ['openlibrary', 'google-books', 'wikimedia'].includes(src.type)) {
          initialCovers[book.filename] = src.url;
        }
      }
      coverMemMerge(initialCovers);
      setLibrary(visibleData.map((book: LibraryBook) => ({ ...book, svg: undefined })));
      setCovers(initialCovers);
      setCoversHydrated(true);`,
);

patch(
  'src/hooks/useLibrary.ts',
  `          const enriched = visibleData.map((book: LibraryBook) => {
            const meta = metadata[book.filename];
            const src = meta?.coverSource;
            // Suppress svg flash whenever we have a declared cover source (incl. bundled/custom)
            const hideBundledSvg = !!src?.type && src.type !== 'ai-generated';
            return {
              ...book,
              title: meta?.title || book.title,
              author: meta?.author || '',
              svg: undefined,
              coverSource: src || undefined
            };
          });`,
  `          const enriched = visibleData.map((book: LibraryBook) => {
            const meta = metadata[book.filename];
            const src = preferredCoverSource(book.coverSource, meta?.coverSource);
            // Preserve bundled SVG until hydration unless a real/custom source supersedes it.
            const hideBundledSvg = !!src?.type && src.type !== 'ai-generated' && src.type !== 'bundled';
            return {
              ...book,
              title: meta?.title || book.title,
              author: meta?.author || book.author || '',
              svg: hideBundledSvg ? undefined : (meta?.svg || book.svg),
              coverSource: src || undefined
            };
          });`,
);

patch(
  'src/hooks/useLibrary.ts',
  `          for (const book of allBooks) {
            const rawBook = withSvg.find((b) => b.filename === book.filename) || book;
            let cover = loadedCovers[book.filename] || (await coverDB.getCover(book.filename));
            if (cover) {`,
  `          for (const book of allBooks) {
            const rawBook = withSvg.find((b) => b.filename === book.filename) || book;
            const chosenSource = preferredCoverSource(rawBook.coverSource, metaUpdates[book.filename]?.coverSource);
            if (chosenSource?.type) {
              const prev = metaUpdates[book.filename] || {
                title: book.title,
                author: book.author || '',
                svg: rawBook.svg,
              };
              metaUpdates[book.filename] = { ...prev, coverSource: chosenSource };
            }

            let cover = loadedCovers[book.filename] || (await coverDB.getCover(book.filename));
            if (cover && shouldReplaceStoredCover(cover, chosenSource)) {
              delete loadedCovers[book.filename];
              await coverDB.deleteCover(book.filename).catch(() => {});
              cover = null;
            }
            if (cover) {`,
);

patch(
  'src/hooks/useLibrary.ts',
  `            const src = rawBook.coverSource || metaUpdates[book.filename]?.coverSource;`,
  `            const src = chosenSource;`,
);

patch(
  'src/hooks/useLibrary.ts',
  `          setLibrary(allBooks.map((b) => ({
            ...b,
            coverSource: metaUpdates[b.filename]?.coverSource || b.coverSource,
          })));`,
  `          setLibrary(allBooks.map((b) => ({
            ...b,
            coverSource: preferredCoverSource(b.coverSource, metaUpdates[b.filename]?.coverSource) || undefined,
          })));`,
);

patch(
  'src/App.tsx',
  `import { APP_VERSION, RELEASE_NOTES_SEEN_KEY } from './utils/releaseNotes';`,
  `import { APP_VERSION, RELEASE_NOTES_SEEN_KEY } from './utils/releaseNotes';
import { shouldOpenTextFirst } from './utils/openMode';`,
);

patch(
  'src/App.tsx',
  `  const toggleReaderMode = async () => {
    // Freeze page before remount — observer would otherwise see top of text view (p~1–3)
    // and saveProgress would overwrite synced progress (feature #1).
    const keepPage = pageNumber;
    modeSwitchPageRef.current = keepPage;
    restoreTargetPageRef.current = keepPage;
    setIsRestoring(true);

    const nextMode = !isReaderMode;
    setIsReaderMode(nextMode);

    if (nextMode && fileType === 'pdf') {`,
  `  const toggleReaderMode = async () => {
    // Freeze page before remount — observer would otherwise see top of text view (p~1–3)
    // and saveProgress would overwrite synced progress (feature #1).
    const keepPage = pageNumber;
    modeSwitchPageRef.current = keepPage;
    restoreTargetPageRef.current = keepPage;
    setIsRestoring(true);

    // Text-first uses a tiny text blob as a mount sentinel until the actual PDF
    // arrives. Never hand that sentinel to PDF.js when the user asks for the original.
    if (isReaderMode && fileType === 'pdf') {
      const book = library.find((candidate) => candidate.filename === fileName);
      if (!book) {
        setIsRestoring(false);
        return;
      }
      showToast('Cargando PDF original…');
      try {
        const blob = await getBookBlob(book);
        const realUrl = URL.createObjectURL(blob);
        setFileUrl((current) => {
          if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
          return realUrl;
        });
        setIsReaderMode(false);
      } catch (e) {
        console.error('[ReaderMode] Failed original PDF load:', e);
        restoreTargetPageRef.current = null;
        modeSwitchPageRef.current = null;
        setIsRestoring(false);
        showToast('No se pudo cargar el PDF original');
      }
      return;
    }

    const nextMode = !isReaderMode;
    setIsReaderMode(nextMode);

    if (nextMode && fileType === 'pdf') {`,
);

patch(
  'src/App.tsx',
  `  useEffect(() => {
    if (!isReaderMode || fileType !== 'pdf' || !fileName) return;
    let cancelled = false;
    (async () => {
      const blob =
        (await coverDB.getBookContent(fileName)) ||
        (fileUrl ? await fetch(fileUrl).then((r) => r.blob()) : null);
      if (cancelled || !blob) return;
      await ensureGhostAround(blob, fileName, pageNumber);
    })();`,
  `  useEffect(() => {
    if (!isReaderMode || fileType !== 'pdf' || !fileName) return;
    let cancelled = false;
    (async () => {
      // During text-first startup fileUrl can be a text sentinel, not a PDF.
      // Only parse a PDF that is already present in the verified book cache.
      const blob = await coverDB.getBookContent(fileName);
      if (cancelled || !blob) return;
      await ensureGhostAround(blob, fileName, pageNumber);
    })();`,
);

patch(
  'src/App.tsx',
  `    fallbackPage?: number,
    preferReaderMode = false,
    initialReaderHtml?: string
  ) => {`,
  `    fallbackPage?: number,
    preferReaderMode?: boolean,
    initialReaderHtml?: string
  ) => {`,
);

patch(
  'src/App.tsx',
  `    const textFirstPdf = preferReaderMode && book.type === 'pdf';`,
  `    const textFirstPdf = shouldOpenTextFirst(book.type, preferReaderMode);`,
);

console.log('Regression fixes applied.');
