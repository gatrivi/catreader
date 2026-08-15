import { describe, it, expect } from 'vitest';
import { hasStoredCover, isSyntheticCover, isUserCustomCover, shouldSkipCoverFetch } from './covers';

describe('covers lock', () => {
  it('detects stored covers', () => {
    expect(hasStoredCover('data:image/jpeg;base64,xx')).toBe(true);
    expect(hasStoredCover('https://x/y.jpg')).toBe(true);
    expect(hasStoredCover('<svg></svg>')).toBe(true);
    expect(hasStoredCover('')).toBe(false);
    expect(hasStoredCover(null)).toBe(false);
  });

  it('protects real/custom covers but lets synthetic covers upgrade', () => {
    expect(shouldSkipCoverFetch({ existingCover: 'https://a' })).toBe(true);
    expect(shouldSkipCoverFetch({ coverSource: { type: 'user-custom' } })).toBe(true);
    expect(shouldSkipCoverFetch({ coverSource: { type: 'openlibrary' } })).toBe(true);
    expect(shouldSkipCoverFetch({ coverSource: { type: 'google-books' } })).toBe(true);
    expect(shouldSkipCoverFetch({ existingCover: '<svg></svg>', coverSource: { type: 'bundled' } })).toBe(false);
    expect(shouldSkipCoverFetch({ existingCover: 'data:image/svg+xml;base64,xx', coverSource: { type: 'ai-generated' } })).toBe(false);
    expect(shouldSkipCoverFetch({})).toBe(false);
    expect(shouldSkipCoverFetch({ force: true, existingCover: 'https://a' })).toBe(false);
  });

  it('detects synthetic covers', () => {
    expect(isSyntheticCover('<svg></svg>')).toBe(true);
    expect(isSyntheticCover('data:image/svg+xml;base64,xx')).toBe(true);
    expect(isSyntheticCover(null, { type: 'ai-generated' })).toBe(true);
    expect(isSyntheticCover(null, { type: 'bundled' })).toBe(true);
    expect(isSyntheticCover('https://x/y.jpg', { type: 'openlibrary' })).toBe(false);
  });

  it('flags user-custom', () => {
    expect(isUserCustomCover({ type: 'user-custom' })).toBe(true);
    expect(isUserCustomCover({ type: 'ai-generated' })).toBe(false);
  });
});
