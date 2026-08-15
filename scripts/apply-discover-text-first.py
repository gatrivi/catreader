from pathlib import Path

app = Path('src/App.tsx')
s = app.read_text(encoding='utf-8')

replacements = [
    (
        """import * as pdfjsBackground from 'pdfjs-dist/legacy/build/pdf.mjs';

// Setup pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
(pdfjsBackground as any).GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${(pdfjsBackground as any).version}/legacy/build/pdf.worker.min.mjs`;
""",
        """import * as pdfjsBackground from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Keep PDF.js fully local/offline. Remote workers make first-open latency network-dependent.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
(pdfjsBackground as any).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
""",
    ),
    (
        """  const warmBook = (book: LibraryBook) => {
    void getBookBlob(book).catch(() => {});
  };
""",
        """  const warmBook = (book: LibraryBook) => {
    // PDFs can be tens of MB. Discover must never start a full PDF download on
    // pointer-down/hover; the text-first open path below warms it after paint.
    if (book.type === 'pdf') return;
    void getBookBlob(book).catch(() => {});
  };
""",
    ),
    (
        """    initialEpubLocation?: string,
    initialScrollRatio?: number,
    fallbackPage?: number
  ) => {
""",
        """    initialEpubLocation?: string,
    initialScrollRatio?: number,
    fallbackPage?: number,
    preferReaderMode = false,
    initialReaderHtml?: string
  ) => {
""",
    ),
    (
        """    setFileName(filename);
    setFileType(book.type);
    setIsReaderMode(false);
    setEpubCfi(initialEpubLocation || '');
""",
        """    const textFirstPdf = preferReaderMode && book.type === 'pdf';
    setFileName(filename);
    setFileType(book.type);
    setIsReaderMode(textFirstPdf);
    setEpubCfi(initialEpubLocation || '');
""",
    ),
    (
        """    const blobPromise = getBookBlob(book);

    try {
      const [blob, progress] = await Promise.all([blobPromise, progressPromise]);
""",
        """    // Discover PDFs paint a readable text view before downloading/parsing the PDF.
    // fileUrl is only a mounted-reader sentinel while ReaderView is in text mode;
    // it is atomically replaced with the real PDF URL in the background.
    if (textFirstPdf) {
      const previewText = initialReaderHtml || 'Preparando texto…';
      const previewUrl = URL.createObjectURL(new Blob([previewText], { type: 'text/plain' }));
      setFileUrl(previewUrl);
      setIsFeedView(false);

      if (skipHistory) {
        const onBookUrl = !!resolveBookRoute(window.location.pathname, window.location.search);
        const hasReaderState = window.history.state?.view === 'reader';
        if (!onBookUrl || !hasReaderState || window.history.length <= 1) {
          seedReaderHistoryStack(bookPath, filename);
        }
      } else {
        pushReaderHistory(bookPath, filename);
      }

      let cachedGhost: string | null = null;
      try {
        cachedGhost = await coverDB.getGhostText(filename);
      } catch { /* IndexedDB failure must not block opening */ }
      if (requestId !== openRequestRef.current) return;

      if (cachedGhost) {
        loadGhostTextToState(cachedGhost);
        if (cachedGhost.startsWith('[')) {
          try {
            const pages = JSON.parse(cachedGhost);
            if (Array.isArray(pages) && pages.length > 0) setNumPages(pages.length);
          } catch { /* legacy ghost formats are handled by loadGhostTextToState */ }
        }
      } else {
        // The Discover fragment is already in memory: show it now instead of a spinner.
        const previewPages = [previewText];
        textContentRef.current = previewPages;
        setTextContent(previewPages);
        setNumPages(1);
        restoreTargetPageRef.current = null;
        modeSwitchPageRef.current = null;
      }

      if (hasForcedPage && cachedGhost) {
        restoreTargetPageRef.current = forcePage;
        modeSwitchPageRef.current = forcePage;
        setPageNumber(forcePage);
        commitPage(forcePage);
      } else {
        setPageNumber(1);
      }
      setIsLoaded(true);
      setIsRestoring(false);

      // Full PDF work happens only after the readable view has painted.
      void getBookBlob(book).then(async (blob) => {
        if (requestId !== openRequestRef.current) return;
        const targetPage = forcePage || fallbackPage || pageNumberRef.current || 1;
        restoreTargetPageRef.current = targetPage;
        modeSwitchPageRef.current = targetPage;
        setIsRestoring(true);

        const realUrl = URL.createObjectURL(blob);
        setFileUrl((current) => {
          if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
          return realUrl;
        });

        await ensureGhostAround(blob, filename, targetPage);
        if (requestId !== openRequestRef.current) return;
        setPageNumber(targetPage);
        commitPage(targetPage);
      }).catch((err) => {
        console.warn('[Reader] Background PDF warm failed:', err);
        restoreTargetPageRef.current = null;
        modeSwitchPageRef.current = null;
        setIsRestoring(false);
        // Keep the already-visible fragment/text cache usable offline.
      });
      return;
    }

    const blobPromise = getBookBlob(book);

    try {
      const [blob, progress] = await Promise.all([blobPromise, progressPromise]);
""",
    ),
    (
        """    void openFromLibrary(
      book,
      undefined,
      undefined,
      false,
      locator.kind === 'epub' ? locator.href : undefined,
      scrollRatio,
      locator.kind === 'pdf' ? locator.page : undefined
    );
""",
        """    void openFromLibrary(
      book,
      locator.kind === 'pdf' ? locator.page : undefined,
      undefined,
      false,
      locator.kind === 'epub' ? locator.href : undefined,
      scrollRatio,
      locator.kind === 'pdf' ? locator.page : undefined,
      locator.kind === 'pdf',
      item.text
    );
""",
    ),
]

for old, new in replacements:
    if old not in s:
        raise SystemExit('Patch anchor not found:\n' + old[:240])
    s = s.replace(old, new, 1)

app.write_text(s, encoding='utf-8')

css = Path('src/index.css')
c = css.read_text(encoding='utf-8')
marker = '/* E-ink / reduced-motion: avoid expensive repaint-heavy transitions. */'
if marker not in c:
    c += """

/* E-ink / reduced-motion: avoid expensive repaint-heavy transitions. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
"""
    css.write_text(c, encoding='utf-8')
