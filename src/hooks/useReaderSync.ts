import { useState, useCallback, useRef, useEffect } from 'react';
import { syncService, ReadingProgress } from '../services/syncService';
import {
  mergeReadingProgress,
  shouldBlockProgressSave,
  resolvePageToPersist,
} from '../utils/progressGuard';
import { debugError, debugInfo, debugWarn } from '../utils/debugLog';

type Theme = 'light' | 'dim' | 'dark' | 'sepia' | 'paper';

interface UseReaderSyncProps {
  fileName: string;
  isLoaded: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  showToast: (msg: string) => void;
  setIsSyncing: (val: boolean) => void;
  /** App restore freeze target — blocks false page-1 saves */
  getRestoreTargetPage?: () => number | null;
}

/**
 * Hook to manage reading progress synchronization.
 * FEATURE #1: synced progress is sacred — see docs/PROGRESS_SACRED.md
 */
export function useReaderSync({
  fileName,
  isLoaded,
  containerRef,
  showToast,
  setIsSyncing,
  getRestoreTargetPage,
}: UseReaderSyncProps) {
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [zoom, setZoom] = useState<number | Record<string, number>>(1.0);
  const [theme, setTheme] = useState<Theme>((localStorage.getItem('catreader_theme') as Theme) || 'dim');
  const [epubCfi, setEpubCfi] = useState<string | undefined>(undefined);
  const [scrollRatio, setScrollRatio] = useState<number>(0);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);

  const zoomMapRef = useRef<Record<string, number>>({});
  const lastCommittedPageRef = useRef<number>(1);
  const pageNumberRef = useRef(pageNumber);
  pageNumberRef.current = pageNumber;
  const isRestoringRef = useRef(isRestoring);
  isRestoringRef.current = isRestoring;

  const getDeviceCategory = useCallback(() => {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }, []);

  const changeZoom = useCallback((delta: number) => {
    const category = getDeviceCategory();
    const currentZoom = typeof zoom === 'number' ? zoom : (zoom[category] || 1.0);
    const newZoomValue = Math.min(Math.max(currentZoom + delta, 0.5), 3.0);

    setZoom(newZoomValue);
    zoomMapRef.current[category] = newZoomValue;
  }, [zoom, getDeviceCategory]);

  const commitPage = useCallback((page: number) => {
    if (page > 0) lastCommittedPageRef.current = Math.max(lastCommittedPageRef.current, page);
  }, []);

  const resetCommittedPage = useCallback(() => {
    lastCommittedPageRef.current = 1;
  }, []);

  const loadProgress = useCallback(async (id: string): Promise<ReadingProgress | null> => {
    const startedAt = performance.now();
    const elapsed = () => Math.round(performance.now() - startedAt);
    debugInfo('reader-progress', 'load start', { filename: id });
    setIsRestoring(true);
    const category = getDeviceCategory();
    const restoreSafetyTimeout = setTimeout(() => {
      debugWarn('reader-progress', 'restore safety timeout', { filename: id, elapsedMs: elapsed() });
      setIsRestoring(false);
    }, 10000);

    const applyProgress = (data: ReadingProgress, source: 'local' | 'cloud' | 'merged'): ReadingProgress => {
      if (data.zoom && typeof data.zoom === 'object') {
        zoomMapRef.current = { ...data.zoom };
      } else if (typeof data.zoom === 'number') {
        zoomMapRef.current = { desktop: data.zoom };
      }

      const targetZoom = zoomMapRef.current[category] || zoomMapRef.current.desktop || 1.0;
      const page = data.page || 1;

      setPageNumber(page);
      lastCommittedPageRef.current = page;
      if (data.epubCfi) setEpubCfi(data.epubCfi);
      setZoom(targetZoom);
      setTheme((data.theme as Theme) || 'sepia');
      setScrollRatio(data.scrollRatio || 0);
      if (data.updatedAt) setLastSyncTime(data.updatedAt);

      const needsScrollRestore =
        (data.page && data.page > 1) ||
        (data.scrollRatio && data.scrollRatio > 0) ||
        !!data.epubCfi;

      debugInfo('reader-progress', 'progress applied', {
        filename: id,
        source,
        page,
        scrollRatio: data.scrollRatio || 0,
        hasEpubCfi: !!data.epubCfi,
        elapsedMs: elapsed(),
      });

      if (!needsScrollRestore) {
        clearTimeout(restoreSafetyTimeout);
        setIsRestoring(false);
      }

      return data;
    };

    try {
      let local: ReadingProgress | null = null;
      const localStr = localStorage.getItem(`catreader_progress_${id}`);
      if (localStr) {
        try {
          local = JSON.parse(localStr) as ReadingProgress;
          debugInfo('reader-progress', 'local progress hit', {
            filename: id,
            page: local.page || 1,
            scrollRatio: local.scrollRatio || 0,
            ageMs: local.updatedAt ? Date.now() - local.updatedAt : null,
            elapsedMs: elapsed(),
          });
        } catch (parseErr) {
          debugWarn('reader-progress', 'ignoring corrupt local progress', { filename: id, error: String(parseErr) });
        }
      } else {
        debugInfo('reader-progress', 'local progress miss', { filename: id, elapsedMs: elapsed() });
      }

      debugInfo('reader-progress', 'cloud progress request', { filename: id, elapsedMs: elapsed() });
      const cloudProgressPromise = syncService.loadProgress(id).then((cloud) => {
        debugInfo('reader-progress', cloud ? 'cloud progress hit' : 'cloud progress miss', {
          filename: id,
          page: cloud?.page || null,
          elapsedMs: elapsed(),
        });
        return cloud;
      }).catch((err) => {
        debugWarn('reader-progress', 'cloud progress load skipped', { filename: id, error: String(err), elapsedMs: elapsed() });
        return null;
      });

      if (local) {
        cloudProgressPromise.then((cloud) => {
          const merged = mergeReadingProgress(local, cloud);
          if (
            merged &&
            cloud &&
            ((cloud.updatedAt || 0) > (local?.updatedAt || 0) || merged.page !== local.page)
          ) {
            applyProgress(merged, 'merged');
          }
        });
        return applyProgress(local, 'local');
      }

      const cloud = await Promise.race([
        cloudProgressPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200))
      ]);

      if (cloud) return applyProgress(cloud, 'cloud');

      debugInfo('reader-progress', 'no progress available before open deadline', { filename: id, elapsedMs: elapsed() });
      clearTimeout(restoreSafetyTimeout);
      setIsRestoring(false);
      lastCommittedPageRef.current = 1;
      return null;
    } catch (err) {
      debugError('reader-progress', 'load failed', { filename: id, error: String(err), elapsedMs: elapsed() });
      clearTimeout(restoreSafetyTimeout);
      setIsRestoring(false);
      return null;
    }
  }, [getDeviceCategory]);

  const saveProgress = useCallback(async (opts?: {
    force?: boolean;
    pageOverride?: number;
  }) => {
    if (!fileName || !isLoaded || !containerRef.current) return;
    if (shouldBlockProgressSave(isRestoringRef.current, opts?.force)) {
      debugInfo('reader-progress', 'save blocked during restore', { filename: fileName, page: pageNumberRef.current });
      return;
    }

    const restoreTarget = getRestoreTargetPage?.() ?? null;
    const page = resolvePageToPersist(
      opts?.pageOverride ?? pageNumberRef.current,
      restoreTarget,
      lastCommittedPageRef.current
    );
    commitPage(page);

    setIsSyncing(true);
    const now = Date.now();
    const category = getDeviceCategory();

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const currentScrollRatio = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;

    const currentZoomValue = typeof zoom === 'number' ? zoom : (zoom[category] || 1.0);
    zoomMapRef.current[category] = currentZoomValue;

    const progress: ReadingProgress = {
      page,
      epubCfi,
      zoom: { ...zoomMapRef.current },
      theme,
      scrollRatio: currentScrollRatio,
      updatedAt: now
    };

    localStorage.setItem(`catreader_progress_${fileName}`, JSON.stringify(progress));
    localStorage.setItem('catreader_last_book', fileName);
    debugInfo('reader-progress', 'progress saved locally', {
      filename: fileName,
      page,
      scrollRatio: currentScrollRatio,
      forced: !!opts?.force,
    });

    await syncService.saveProgress(fileName, progress);

    setLastSyncTime(now);
    setIsSyncing(false);
  }, [
    fileName,
    isLoaded,
    zoom,
    theme,
    epubCfi,
    getDeviceCategory,
    containerRef,
    setIsSyncing,
    getRestoreTargetPage,
    commitPage,
  ]);

  useEffect(() => {
    localStorage.setItem('catreader_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!isRestoring && pageNumber > 1) {
      commitPage(pageNumber);
    }
  }, [isRestoring, pageNumber, commitPage]);

  return {
    pageNumber, setPageNumber,
    zoom, setZoom,
    theme, setTheme,
    epubCfi, setEpubCfi,
    scrollRatio, setScrollRatio,
    isRestoring, setIsRestoring,
    lastSyncTime,
    getDeviceCategory,
    changeZoom,
    loadProgress,
    saveProgress,
    commitPage,
    resetCommittedPage,
  };
}
