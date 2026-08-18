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

// 1) Make no-cover books readable in the 4-column mobile rack.
{
  const path = 'src/components/BookCover.tsx';
  let text = read(path);

  text = replaceOnce(
    text,
`                <div className="flex-1 p-3 flex flex-col justify-between text-center overflow-hidden">
                  <div className={cn(
                    "font-serif font-bold text-sm leading-tight line-clamp-4 mt-2 break-words",
                    isSimplified ? "text-stone-300" : "text-[#5b4636]"
                  )}>
                    {spineTitle}
                  </div>
                  <div className={cn(
                    "font-serif text-[10px] uppercase tracking-widest line-clamp-2 mb-2 break-words",
                    isSimplified ? "text-stone-500" : "text-[#8b5a2b]"
                  )}>
                    {book.author || 'Autor Desconocido'}
                  </div>
                </div>`,
`                <div className="flex-1 px-1.5 py-2 sm:p-3 flex flex-col justify-center text-center overflow-hidden min-h-0">
                  <div className={cn(
                    "font-serif font-bold text-[9px] min-[380px]:text-[10px] sm:text-sm leading-[1.12] sm:leading-tight line-clamp-7 sm:line-clamp-5 break-normal [overflow-wrap:anywhere]",
                    isSimplified ? "text-stone-300" : "text-[#5b4636]"
                  )}>
                    {spineTitle}
                  </div>
                  {book.author && book.author !== 'Desconocido' && book.author !== 'Autor Desconocido' && (
                    <div className={cn(
                      "font-serif text-[7px] sm:text-[10px] uppercase tracking-wide sm:tracking-widest line-clamp-2 mt-1.5 sm:mt-3 break-normal [overflow-wrap:anywhere]",
                      isSimplified ? "text-stone-500" : "text-[#8b5a2b]"
                    )}>
                      {book.author}
                    </div>
                  )}
                </div>`,
    'readable fallback cover',
  );

  text = replaceOnce(
    text,
`                  <p className="text-white text-[9px] sm:text-[10px] font-bold leading-tight line-clamp-2 text-center drop-shadow-md">`,
`                  <p className="text-white text-[8px] min-[380px]:text-[9px] sm:text-[10px] font-bold leading-[1.15] line-clamp-3 sm:line-clamp-2 text-center drop-shadow-md">`,
    'cover art title label',
  );

  write(path, text);
}

// 2) Resolve missing/synthetic covers in seconds instead of one library slot every 10s.
{
  const path = 'src/hooks/useLibrary.ts';
  let text = read(path);

  text = replaceOnce(
    text,
`  const fetchEnhancedCover = useCallback(async (book: LibraryBook, forceAI = false) => {
    console.log(\`[Cover] fetchEnhancedCover called for \${book.title}, forceAI=\${forceAI}\`);`,
`  const fetchEnhancedCover = useCallback(async (book: LibraryBook, forceAI = false, background = false) => {
    console.log(\`[Cover] fetchEnhancedCover called for \${book.title}, forceAI=\${forceAI}, background=\${background}\`);`,
    'background cover resolver signature',
  );

  const fnStart = text.indexOf('  const fetchEnhancedCover = useCallback');
  const fnEnd = text.indexOf('  const handleCoverUpload', fnStart);
  if (fnStart < 0 || fnEnd < 0) throw new Error('fetchEnhancedCover region not found');
  let fn = text.slice(fnStart, fnEnd);

  fn = replaceOnce(
    fn,
`    setIdentifyingBookId(book.id);`,
`    if (!background) setIdentifyingBookId(book.id);`,
    'quiet background identification',
  );

  fn = replaceOnce(
    fn,
`      const searchTitle = book.title.replace(/\\[.*?\\]|\\(.*?\\)/g, '').trim();`,
`      const rawSearchTitle = book.title && book.title !== book.filename
        ? book.title
        : book.filename.replace(/\\.[^/.]+$/, '');
      const searchTitle = rawSearchTitle
        .replace(/[-_]+/g, ' ')
        .replace(/\\[.*?\\]|\\(.*?\\)/g, '')
        .replace(/\\s+/g, ' ')
        .trim();`,
    'filename-friendly cover search title',
  );

  fn = replaceOnce(
    fn,
`          const newMetadata = { ...enrichedMetadataRef.current, [book.filename]: next };
          setEnrichedMetadata(newMetadata);
          try { await coverDB.saveBookMetadata(book.filename, next); } catch {}
          return;`,
`          const newMetadata = { ...enrichedMetadataRef.current, [book.filename]: next };
          enrichedMetadataRef.current = newMetadata;
          setEnrichedMetadata(newMetadata);
          localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
          try { await coverDB.saveBookMetadata(book.filename, next); } catch {}
          return;`,
    'persist google cover source immediately',
  );

  fn = replaceOnce(
    fn,
`            const newMetadata = { ...enrichedMetadataRef.current, [book.filename]: next };
            setEnrichedMetadata(newMetadata);
            try { await coverDB.saveBookMetadata(book.filename, next); } catch {}
            return;`,
`            const newMetadata = { ...enrichedMetadataRef.current, [book.filename]: next };
            enrichedMetadataRef.current = newMetadata;
            setEnrichedMetadata(newMetadata);
            localStorage.setItem('catreader_enriched_metadata', JSON.stringify(newMetadata));
            try { await coverDB.saveBookMetadata(book.filename, next); } catch {}
            return;`,
    'persist openlibrary cover source immediately',
  );

  fn = replaceOnce(
    fn,
`      setTimeout(() => setIdentifyingBookId(null), 1000);`,
`      if (!background) setTimeout(() => setIdentifyingBookId(null), 1000);`,
    'quiet background identification cleanup',
  );

  text = text.slice(0, fnStart) + fn + text.slice(fnEnd);

  const scanStartMarker = `  useEffect(() => {\n    if (!isIdle) return;\n    const timer = setInterval(async () => {`;
  const scanStart = text.indexOf(scanStartMarker);
  const scanEndMarker = `  }, [isIdle, library.length, coverScanKey, fetchEnhancedCover, enrichBookWithGemini, putCover]);`;
  const scanEnd = text.indexOf(scanEndMarker, scanStart);
  if (scanStart < 0 || scanEnd < 0) throw new Error('old slow cover scan region not found');
  const scanEndPos = scanEnd + scanEndMarker.length;

  const fastScan = `  useEffect(() => {
    if (!isIdle || library.length === 0 || isSyncing) return;

    let cancelled = false;
    const runFastCoverScan = async () => {
      let cursor = Math.min(autoCoverIndexRef.current, library.length);
      const batchSize = 4;

      while (cursor < library.length && !cancelled) {
        const batch: Array<{ book: LibraryBook; index: number }> = [];

        while (cursor < library.length && batch.length < batchSize && !cancelled) {
          const index = cursor;
          const book = library[cursor];
          cursor += 1;
          autoCoverIndexRef.current = cursor;
          setAutoCoverIndex(cursor);

          const existingCover =
            coversRef.current[book.filename] ||
            coverMem.map[book.filename] ||
            (await coverDB.getCover(book.filename));
          const source = preferredCoverSource(
            book.coverSource,
            enrichedMetadataRef.current[book.filename]?.coverSource,
          );

          if (!shouldSkipCoverFetch({ existingCover, coverSource: source })) {
            batch.push({ book, index });
          }
        }

        if (batch.length) {
          setEnrichmentProgress({
            current: batch[0].index + 1,
            total: library.length,
            filename: \`Portadas: \${batch.map(({ book }) => book.title).join(' · ')}\`,
          });
          await Promise.allSettled(
            batch.map(({ book }) => fetchEnhancedCover(book, false, true)),
          );
        }

        // Tiny yield keeps touch/scroll responsive while still finishing a
        // 60-book library in seconds rather than ~10 minutes.
        if (cursor < library.length && !cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      if (!cancelled) setEnrichmentProgress(null);
    };

    void runFastCoverScan();
    return () => {
      cancelled = true;
    };
  }, [isIdle, isSyncing, library.length, coverScanKey, fetchEnhancedCover]);`;

  text = text.slice(0, scanStart) + fastScan + text.slice(scanEndPos);
  write(path, text);
}

console.log('Mobile cover readability patch applied.');
