import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncService } from './syncService';

// Mock Firebase
vi.mock('../firebase', () => ({
  db: {},
  ensureAuth: vi.fn().mockResolvedValue({ uid: 'test-uid' })
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn()
}));

import { getDoc, setDoc } from 'firebase/firestore';

describe('syncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should save progress to Firestore', async () => {
    (setDoc as any).mockResolvedValue(true);
    
    const progress = {
      page: 10,
      zoom: 1.5,
      theme: 'dark',
      scrollRatio: 0.5,
      updatedAt: Date.now()
    };
    
    const result = await syncService.saveProgress('test-book', progress);
    
    expect(result).toBe(true);
    expect(setDoc).toHaveBeenCalled();
  });

  it('should load progress from Firestore', async () => {
    const mockData = { page: 5, updatedAt: { toMillis: () => 12345 } };
    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => mockData
    });
    
    const result = await syncService.loadProgress('test-book');
    
    expect(result).toEqual({ page: 5, updatedAt: 12345 });
  });

  it('should return null if book not found in Firestore', async () => {
    (getDoc as any).mockResolvedValue({
      exists: () => false
    });
    
    const result = await syncService.loadProgress('non-existent');
    
    expect(result).toBe(null);
  });
});
