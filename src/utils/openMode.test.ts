import { describe, expect, it } from 'vitest';
import { shouldOpenTextFirst } from './openMode';

describe('reader open mode', () => {
  it('opens normal PDFs text-first by default', () => {
    expect(shouldOpenTextFirst('pdf')).toBe(true);
    expect(shouldOpenTextFirst('PDF')).toBe(true);
  });

  it('does not force text mode for EPUB/TXT', () => {
    expect(shouldOpenTextFirst('epub')).toBe(false);
    expect(shouldOpenTextFirst('txt')).toBe(false);
  });

  it('allows an explicit original-PDF request', () => {
    expect(shouldOpenTextFirst('pdf', false)).toBe(false);
  });
});
