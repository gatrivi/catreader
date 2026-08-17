import { describe, it, expect } from 'vitest';
import {
  hasStoredCover,
  isSyntheticCover,
  isUserCustomCover,
  preferredCoverSource,
  shouldReplaceStoredCover,
  shouldSkipCoverFetch,
} from './covers';

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

  it('uses shipped real art even when stale automatic cache has a newer timestamp', () => {
    const staleOpenLibrary = {
      type: 'openlibrary' as const,
      url: 'https://covers.openlibrary.org/old.jpg',
      updatedAt: 999999,
    };
    const shippedWikimedia = {
      type: 'wikimedia' as const,
      url: 'https://commons.wikimedia.org/new.jpg',
      updatedAt: 200,
    };

    expect(preferredCoverSource(shippedWikimedia, staleOpenLibrary)).toEqual(shippedWikimedia);
    expect(shouldReplaceStoredCover(staleOpenLibrary.url, shippedWikimedia)).toBe(true);
  });

  it('never lets catalogue art overwrite a user custom cover', () => {
    const custom = {
      type: 'user-custom' as const,
      url: 'https://storage.example/custom.jpg',
      updatedAt: 10,
    };
    const catalogue = {
      type: 'wikimedia' as const,
      url: 'https://commons.wikimedia.org/new.jpg',
      updatedAt: 999,
    };

    expect(preferredCoverSource(catalogue, custom)).toEqual(custom);
    expect(shouldReplaceStoredCover('data:image/jpeg;base64,user', custom)).toBe(false);
  });
});
