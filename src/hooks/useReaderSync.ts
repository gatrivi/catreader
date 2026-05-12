import { useState, useCallback, useRef, useEffect } from 'react';
import { syncService, ReadingProgress } from '../services/syncService';

type Theme = 'light' | 'dim' | 'dark' | 'sepia';

interface UseReaderSyncProps {
  fileName: string;
  isLoaded: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  showToast: (msg: string) => void;
  setIsSyncing: (val: boolean) => void;
}

/**
 * Hook to manage reading progress synchronization.
 * Handles loading/saving progress and zoom/theme persistence.
 */
export function useReaderSync({
  fileName,
  isLoaded,
  containerRef,
  showToast,
  setIsSyncing
}: UseReaderSyncProps) {
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [zoom, setZoom] = useState<number | Record<string, number>>(1.0);
  const [theme, setTheme] = useState<Theme>((localStorage.getItem('catreader_theme') as Theme) || 'dim');
  const [epubCfi, setEpubCfi] = useState<string | undefined>(undefined);
  const [scrollRatio, setScrollRatio] = useState<number>(0);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);

  // Keep track of the full zoom map from the last load/save to avoid flattening
  const zoomMapRef = useRef<Record<string, number>>({});

  /**
   * Identifies the device category based on screen width.
   */
  const getDeviceCategory = useCallback(() => {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }, []);

  /**
   * Updates the zoom level for the current device category.
   */
  const changeZoom = useCallback((delta: number) => {
    const category = getDeviceCategory();
    const currentZoom = typeof zoom === 'number' ? zoom : (zoom[category] || 1.0);
    const newZoomValue = Math.min(Math.max(currentZoom + delta, 0.5), 3.0);
    
    setZoom(newZoomValue);
    // Update our internal map too
    zoomMapRef.current[category] = newZoomValue;
  }, [zoom, getDeviceCategory]);

  /**
   * Loads reading progress for a specific book.
   */
  const loadProgress = useCallback(async (id: string): Promise<ReadingProgress | null> => {
    setIsSyncing(true);
    setIsRestoring(true);
    const category = getDeviceCategory();
    
    // Safety unlock for isRestoring: prevents getting stuck if PDF fails to render
    const timeout = setTimeout(() => setIsRestoring(false), 10000);

    try {
      const progress = await syncService.loadProgress(id);
      const localStr = localStorage.getItem(`catreader_progress_${id}`);
      const local = localStr ? JSON.parse(localStr) : null;
      const data = progress || local;
      
      if (data) {
        // Restore the full zoom map if available to ensure other device settings aren't lost
        if (data.zoom && typeof data.zoom === 'object') {
          zoomMapRef.current = { ...data.zoom };
        } else if (typeof data.zoom === 'number') {
          // Back-fill previous format
          zoomMapRef.current = { 'desktop': data.zoom };
        }

        const targetZoom = zoomMapRef.current[category] || zoomMapRef.current['desktop'] || 1.0;

        setPageNumber(data.page || 1);
        if (data.epubCfi) setEpubCfi(data.epubCfi);
        setZoom(targetZoom);
        setTheme(data.theme as Theme || 'sepia');
        setScrollRatio(data.scrollRatio || 0);
        if (data.updatedAt) setLastSyncTime(data.updatedAt);
        
        clearTimeout(timeout);
        setIsRestoring(false);
        return data;
      }
      
      clearTimeout(timeout);
      setIsRestoring(false);
      return null;
    } catch (err) {
      console.error('Sync load error:', err);
      clearTimeout(timeout);
      setIsRestoring(false);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [getDeviceCategory, setIsSyncing]);

  /**
   * Saves the current reading progress.
   */
  const saveProgress = useCallback(async () => {
    if (!fileName || !isLoaded || !containerRef.current || isRestoring) return;

    setIsSyncing(true);
    const now = Date.now();
    const category = getDeviceCategory();

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const currentScrollRatio = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;

    // Update the map with current zoom for current category
    const currentZoomValue = typeof zoom === 'number' ? zoom : (zoom[category] || 1.0);
    zoomMapRef.current[category] = currentZoomValue;

    const progress: ReadingProgress = {
      page: pageNumber,
      epubCfi,
      zoom: { ...zoomMapRef.current },
      theme,
      scrollRatio: currentScrollRatio,
      updatedAt: now
    };

    localStorage.setItem(`catreader_progress_${fileName}`, JSON.stringify(progress));
    localStorage.setItem('catreader_last_book', fileName);

    await syncService.saveProgress(fileName, progress);

    setLastSyncTime(now);
    setIsSyncing(false);
  }, [fileName, isLoaded, isRestoring, zoom, theme, pageNumber, epubCfi, getDeviceCategory, containerRef, setIsSyncing]);

  // Handle theme changes persisting to localStorage
  useEffect(() => {
    localStorage.setItem('catreader_theme', theme);
  }, [theme]);

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
    saveProgress
  };
}
