import { describe, it, expect } from 'vitest';
import { hasStoredCover, isUserCustomCover, shouldSkipCoverFetch } from './covers';

describe('covers lock', () => {
  it('detects stored covers', () => {
    expect(hasStoredCover('data:image/jpeg;base64,xx')).toBe(true);
    expect(hasStoredCover('https://x/y.jpg')).toBe(true);
    expect(hasStoredCover('<svg></svg>')).toBe(true);
    expect(hasStoredCover('')).toBe(false);
    expect(hasStoredCover(null)).toBe(false);
  });

  it('skips fetch when cover exists', () => {
    expect(shouldSkipCoverFetch({ existingCover: 'https://a' })).toBe(true);
    expect(shouldSkipCoverFetch({ coverSource: { type: 'user-custom' } })).toBe(true);
    expect(shouldSkipCoverFetch({ coverSource: { type: 'openlibrary' } })).toBe(true);
    expect(shouldSkipCoverFetch({})).toBe(false);
    expect(shouldSkipCoverFetch({ force: true, existingCover: 'https://a' })).toBe(false);
  });

  it('flags user-custom', () => {
    expect(isUserCustomCover({ type: 'user-custom' })).toBe(true);
    expect(isUserCustomCover({ type: 'ai-generated' })).toBe(false);
  });
});
