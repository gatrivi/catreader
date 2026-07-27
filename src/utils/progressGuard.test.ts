import { describe, it, expect } from 'vitest';
import {
  shouldBlockPageObserver,
  shouldBlockProgressSave,
  mergeReadingProgress,
  resolvePageToPersist,
} from './progressGuard';
import type { ReadingProgress } from '../services/syncService';

const base = (over: Partial<ReadingProgress>): ReadingProgress => ({
  page: 1,
  zoom: 1,
  theme: 'dim',
  scrollRatio: 0,
  updatedAt: 1000,
  ...over,
});

describe('progressGuard', () => {
  it('blocks observer while restoring', () => {
    expect(shouldBlockPageObserver(true, null)).toBe(true);
    expect(shouldBlockPageObserver(false, 12)).toBe(true);
    expect(shouldBlockPageObserver(false, null)).toBe(false);
  });

  it('blocks save while restoring unless forced', () => {
    expect(shouldBlockProgressSave(true)).toBe(true);
    expect(shouldBlockProgressSave(true, true)).toBe(false);
    expect(shouldBlockProgressSave(false)).toBe(false);
  });

  it('merge rejects false reset to page 1–3', () => {
    const local = base({ page: 120, updatedAt: 1000 });
    const cloud = base({ page: 3, updatedAt: 2000 });
    expect(mergeReadingProgress(local, cloud)?.page).toBe(120);
  });

  it('merge keeps genuinely newer forward progress', () => {
    const local = base({ page: 10, updatedAt: 1000 });
    const cloud = base({ page: 40, updatedAt: 5000 });
    expect(mergeReadingProgress(local, cloud)?.page).toBe(40);
  });

  it('resolvePageToPersist refuses early flicker vs committed', () => {
    expect(resolvePageToPersist(3, null, 88)).toBe(88);
    expect(resolvePageToPersist(90, null, 88)).toBe(90);
    expect(resolvePageToPersist(2, 50, 50)).toBe(50);
  });
});
