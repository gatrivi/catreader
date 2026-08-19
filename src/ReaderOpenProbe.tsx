import React, { useCallback, useEffect, useRef, useState } from 'react';
import App from './App';
import { coverDB } from './services/db';
import { debugInfo, debugWarn } from './utils/debugLog';
import {
  loadReaderPreview,
  makeReaderPreviewHtml,
  saveReaderPreview,
} from './utils/readerPreview';

type PreviewSource = 'last-read' | 'ghost-last-page' | 'ghost-first-page' | 'txt-first-chunk';

interface ActivePreview {
  filename: string;
  html: string;
  source: PreviewSource;
  startedAt: number;
}

function bookType(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function readLocalProgress(filename: string): { page: number; scrollRatio: number } {
  try {
    const raw = localStorage.getItem(`catreader_progress_${filename}`);
    if (!raw) return { page: 1, scrollRatio: 0 };
    const parsed = JSON.parse(raw);
    return {
      page: Math.max(1, Number(parsed?.page) || 1),
      scrollRatio: Math.min(1, Math.max(0, Number(parsed?.scrollRatio) || 0)),
    };
  } catch {
    return { page: 1, scrollRatio: 0 };
  }
}

function parseGhostPage(stored: string, targetPage: number): { page: number; source: string; fromTarget: boolean } | null {
  if (!stored?.trim()) return null;
  if (stored.startsWith('[')) {
    try {
      const pages = JSON.parse(stored);
      if (Array.isArray(pages)) {
        const target = pages[targetPage - 1];
        if (typeof target === 'string' && target.trim()) {
          return { page: targetPage, source: target, fromTarget: true };
        }
        const firstIndex = pages.findIndex((page) => typeof page === 'string' && page.trim());
        if (firstIndex >= 0) {
          return { page: firstIndex + 1, source: pages[firstIndex], fromTarget: false };
        }
      }
    } catch {
      return null;
    }
  }

  if (stored.includes('[Page ')) {
    const pages = stored.split(/\[Page \d+\]\n/).filter(Boolean);
    const target = pages[targetPage - 1];
    if (target?.trim()) return { page: targetPage, source: target, fromTarget: true };
    if (pages[0]?.trim()) return { page: 1, source: pages[0], fromTarget: false };
  }

  return { page: 1, source: stored, fromTarget: targetPage === 1 };
}

function findScrollableParent(node: Element | null): HTMLElement | null {
  let current = node?.parentElement || null;
  while (current) {
    const style = getComputedStyle(current);
    if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) return current;
    current = current.parentElement;
  }
  return null;
}

function nearestVisiblePage(): { page: number; source: string; scrollRatio: number } | null {
  const viewportCenter = window.innerHeight / 2;
  const textPages = Array.from(document.querySelectorAll<HTMLElement>('.text-page-wrapper[data-page]'));
  let best: { node: HTMLElement; distance: number } | null = null;

  for (const node of textPages) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const center = rect.top + rect.height / 2;
    const distance = Math.abs(center - viewportCenter);
    if (!best || distance < best.distance) best = { node, distance };
  }

  if (best) {
    const node = best.node;
    const body = node.querySelector<HTMLElement>('.semantic-page-content');
    const source = body?.innerHTML || body?.innerText || '';
    if (source.trim()) {
      const scroller = findScrollableParent(node);
      const scrollRatio = scroller && scroller.scrollHeight > scroller.clientHeight
        ? scroller.scrollTop / (scroller.scrollHeight - scroller.clientHeight)
        : 0;
      return {
        page: Math.max(1, Number(node.dataset.page) || 1),
        source,
        scrollRatio: Math.min(1, Math.max(0, scrollRatio)),
      };
    }
  }

  const pdfPages = Array.from(document.querySelectorAll<HTMLElement>('.react-pdf__Page[data-page-number]'));
  for (const node of pdfPages) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const source = node.querySelector<HTMLElement>('.react-pdf__Page__textContent')?.innerText || node.innerText || '';
    if (source.trim()) {
      return {
        page: Math.max(1, Number(node.dataset.pageNumber) || 1),
        source,
        scrollRatio: 0,
      };
    }
  }

  return null;
}

async function streamTxtFirstChunk(filename: string): Promise<string | null> {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const booksDirPath = baseUrl.endsWith('/') ? `${baseUrl}books/` : `${baseUrl}/books/`;
  const url = `${booksDirPath}${encodeURIComponent(filename)}`;
  const startedAt = performance.now();
  debugInfo('reader-open', 'txt preview request', { filename, url });

  try {
    const response = await fetch(url, {
      cache: 'default',
      headers: { Range: 'bytes=0-16383' },
    });
    if (!response.ok) throw new Error(`preview returned ${response.status}`);

    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      debugInfo('reader-open', 'txt preview response', {
        filename,
        status: response.status,
        range: response.headers.get('content-range'),
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      return makeReaderPreviewHtml(text, 0);
    }

    const decoder = new TextDecoder();
    let text = '';
    while (text.length < 12000) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) text += decoder.decode(value, { stream: true });
      if (text.length >= 12000) break;
    }
    await reader.cancel().catch(() => {});
    text += decoder.decode();
    debugInfo('reader-open', 'txt first bytes arrived', {
      filename,
      chars: text.length,
      status: response.status,
      range: response.headers.get('content-range'),
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return makeReaderPreviewHtml(text, 0);
  } catch (error) {
    debugWarn('reader-open', 'txt preview failed', {
      filename,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return null;
  }
}

function readerHasRealContent(): boolean {
  const textBodies = Array.from(document.querySelectorAll<HTMLElement>('.semantic-page-content'));
  if (textBodies.some((body) => {
    const text = body.innerText.trim();
    return text.length > 80 && !/^Preparando texto/i.test(text);
  })) return true;

  return !!document.querySelector('.react-pdf__Page canvas, .epub-container iframe');
}

function themeBackground(): { background: string; color: string } {
  const theme = localStorage.getItem('catreader_theme') || 'dim';
  if (theme === 'light') return { background: '#f8f9fa', color: '#292524' };
  if (theme === 'sepia' || theme === 'paper') return { background: '#e8dcc7', color: '#5c4b37' };
  if (theme === 'dark') return { background: '#121212', color: '#a3a3a3' };
  return { background: '#334155', color: '#cbd5e1' };
}

export default function ReaderOpenProbe() {
  const [preview, setPreview] = useState<ActivePreview | null>(null);
  const activeFilenameRef = useRef<string | null>(null);
  const openStartedRef = useRef<number>(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistVisiblePreview = useCallback(() => {
    const filename = localStorage.getItem('catreader_last_book');
    if (!filename) return;
    const visible = nearestVisiblePage();
    if (!visible) return;

    const ratio = bookType(filename) === 'txt' ? visible.scrollRatio : 0;
    const stored = saveReaderPreview(filename, visible.page, visible.source, ratio);
    if (stored) {
      debugInfo('reader-open', 'readable preview checkpoint saved', {
        filename,
        page: stored.page,
        scrollRatio: stored.scrollRatio,
        chars: stored.html.length,
      });
    }
  }, []);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(persistVisiblePreview, 900);
  }, [persistVisiblePreview]);

  const restoreKnownPage = useCallback((filename: string) => {
    const { page } = readLocalProgress(filename);
    if (page <= 1) return false;
    const target = document.getElementById(`text-page-${page}`) || document.getElementById(`page-${page}`);
    if (!target) return false;
    target.scrollIntoView({ behavior: 'instant', block: 'start' });
    debugInfo('reader-open', 'local page restored by probe', {
      filename,
      page,
      elapsedMs: Math.round(performance.now() - openStartedRef.current),
    });
    return true;
  }, []);

  const startProbe = useCallback(async (filename: string) => {
    if (!filename || activeFilenameRef.current === filename) return;
    activeFilenameRef.current = filename;
    openStartedRef.current = performance.now();
    const type = bookType(filename);
    const progress = readLocalProgress(filename);

    debugInfo('reader-open', 'open observed', {
      filename,
      type,
      localPage: progress.page,
      localScrollRatio: progress.scrollRatio,
    });

    const cached = loadReaderPreview(filename);
    if (cached) {
      setPreview({ filename, html: cached.html, source: 'last-read', startedAt: openStartedRef.current });
      debugInfo('reader-open', 'instant preview cache hit', {
        filename,
        page: cached.page,
        chars: cached.html.length,
        ageMs: cached.updatedAt ? Date.now() - cached.updatedAt : null,
        elapsedMs: Math.round(performance.now() - openStartedRef.current),
      });
    } else {
      debugInfo('reader-open', 'instant preview cache miss', { filename });
    }

    if (!cached && type === 'txt') {
      const html = await streamTxtFirstChunk(filename);
      if (html && activeFilenameRef.current === filename) {
        saveReaderPreview(filename, 1, html, 0);
        setPreview({ filename, html, source: 'txt-first-chunk', startedAt: openStartedRef.current });
      }
    } else if (!cached && type === 'pdf') {
      const ghostStarted = performance.now();
      debugInfo('reader-open', 'ghost preview lookup start', { filename, targetPage: progress.page });
      try {
        const ghost = await coverDB.getGhostText(filename);
        if (activeFilenameRef.current !== filename) return;
        const page = ghost ? parseGhostPage(ghost, progress.page) : null;
        if (page) {
          const html = makeReaderPreviewHtml(page.source, 0);
          if (html) {
            saveReaderPreview(filename, page.page, page.source, 0);
            setPreview({
              filename,
              html,
              source: page.fromTarget ? 'ghost-last-page' : 'ghost-first-page',
              startedAt: openStartedRef.current,
            });
            debugInfo('reader-open', 'ghost preview ready', {
              filename,
              requestedPage: progress.page,
              previewPage: page.page,
              source: page.fromTarget ? 'last-page' : 'first-available',
              elapsedMs: Math.round(performance.now() - ghostStarted),
            });
          }
        } else {
          debugInfo('reader-open', 'ghost preview miss', {
            filename,
            elapsedMs: Math.round(performance.now() - ghostStarted),
          });
        }
      } catch (error) {
        debugWarn('reader-open', 'ghost preview lookup failed', {
          filename,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (activeFilenameRef.current !== filename) return;
      debugInfo('reader-open', 'two animation frames after open', {
        filename,
        hasReaderDom: !!document.querySelector('.semantic-page-content, .react-pdf__Page, .epub-container'),
        elapsedMs: Math.round(performance.now() - openStartedRef.current),
      });
    }));

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (activeFilenameRef.current !== filename) return;
      debugWarn('reader-open', 'open probe timeout', {
        filename,
        elapsedMs: Math.round(performance.now() - openStartedRef.current),
        hasRealContent: readerHasRealContent(),
      });
      setPreview(null);
    }, 12000);
  }, []);

  useEffect(() => {
    const checkOpen = () => {
      const filename = localStorage.getItem('catreader_last_book');
      if (!filename) {
        activeFilenameRef.current = null;
        if (preview) setPreview(null);
        return;
      }
      if (filename !== activeFilenameRef.current) void startProbe(filename);
    };

    const onInteraction = () => queueMicrotask(checkOpen);
    document.addEventListener('click', onInteraction, true);
    document.addEventListener('pointerup', onInteraction, true);

    const root = document.getElementById('root');
    const observer = new MutationObserver(() => {
      checkOpen();
      const filename = activeFilenameRef.current;
      if (!filename) return;

      restoreKnownPage(filename);

      if (readerHasRealContent()) {
        debugInfo('reader-open', 'real reader content ready', {
          filename,
          elapsedMs: Math.round(performance.now() - openStartedRef.current),
          textPages: document.querySelectorAll('.semantic-page-content').length,
          pdfCanvases: document.querySelectorAll('.react-pdf__Page canvas').length,
        });
        setPreview(null);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      }
    });
    if (root) observer.observe(root, { subtree: true, childList: true, characterData: true });

    checkOpen();
    return () => {
      document.removeEventListener('click', onInteraction, true);
      document.removeEventListener('pointerup', onInteraction, true);
      observer.disconnect();
    };
  }, [preview, restoreKnownPage, startProbe]);

  useEffect(() => {
    const onScroll = () => schedulePersist();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persistVisiblePreview();
    };
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', persistVisiblePreview);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', persistVisiblePreview);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [persistVisiblePreview, schedulePersist]);

  const colors = themeBackground();

  return (
    <>
      <App />
      {preview && (
        <div
          data-reader-instant-preview
          className="fixed inset-0 z-[30] overflow-auto pointer-events-none"
          style={{ background: colors.background, color: colors.color }}
          aria-hidden="true"
        >
          <article
            className="max-w-2xl mx-auto px-6 py-20 sm:px-12 sm:py-24 font-serif leading-relaxed text-lg"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        </div>
      )}
    </>
  );
}
