import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReaderSync } from './useReaderSync';
import { syncService } from '../services/syncService';

vi.mock('../services/syncService', () => ({
  syncService: {
    loadProgress: vi.fn(),
    saveProgress: vi.fn()
  }
}));

describe('useReaderSync', () => {
  const mockProps = {
    fileName: 'test.pdf',
    isLoaded: true,
    containerRef: { 
      current: {
        scrollTop: 100,
        scrollHeight: 1000,
        clientHeight: 500
      }
    } as any,
    showToast: vi.fn(),
    setIsSyncing: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal('innerWidth', 1200); // Default to desktop
  });

  it('should load zoom map and pick correct category', async () => {
    const zoomMap = { desktop: 1.5, mobile: 2.0 };
    (syncService.loadProgress as any).mockResolvedValue({
      page: 10,
      zoom: zoomMap,
      updatedAt: Date.now()
    });

    const { result } = renderHook(() => useReaderSync(mockProps));

    await act(async () => {
      await result.current.loadProgress('test.pdf');
    });

    expect(result.current.zoom).toBe(1.5);
    expect(result.current.pageNumber).toBe(10);
  });

  it('should save zoom map and not flatten other categories', async () => {
    const zoomMap = { desktop: 1.5, mobile: 2.0 };
    (syncService.loadProgress as any).mockResolvedValue({
      page: 10,
      zoom: zoomMap,
      updatedAt: Date.now()
    });

    const { result } = renderHook(() => useReaderSync(mockProps));

    await act(async () => {
      await result.current.loadProgress('test.pdf');
    });

    // Change zoom on desktop
    act(() => {
      result.current.changeZoom(0.1); // 1.5 -> 1.6
    });

    await act(async () => {
      await result.current.saveProgress();
    });

    expect(syncService.saveProgress).toHaveBeenCalledWith(
      'test.pdf',
      expect.objectContaining({
        zoom: { desktop: 1.6, mobile: 2.0 }
      })
    );
  });

  it('should handle back-filling from old numeric zoom format', async () => {
    (syncService.loadProgress as any).mockResolvedValue({
      page: 5,
      zoom: 1.8, // Old format
      updatedAt: Date.now()
    });

    const { result } = renderHook(() => useReaderSync(mockProps));

    await act(async () => {
      await result.current.loadProgress('test.pdf');
    });

    // On desktop, it should use the numeric zoom as desktop zoom
    expect(result.current.zoom).toBe(1.8);

    // When saving, it should convert to map format
    await act(async () => {
      await result.current.saveProgress();
    });

    expect(syncService.saveProgress).toHaveBeenCalledWith(
      'test.pdf',
      expect.objectContaining({
        zoom: expect.objectContaining({ desktop: 1.8 })
      })
    );
  });
});
