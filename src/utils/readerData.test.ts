import { describe, expect, it } from 'vitest';
import {
  parseReaderPayload,
  parseStoredReaderText,
  readerAssetPath,
  safeReaderId,
} from './readerData';

describe('reader data', () => {
  it('uses a stable, URL-safe asset id', () => {
    expect(safeReaderId('John Smith — Vol. 1.pdf')).toBe('John_Smith___Vol._1.pdf');
    expect(readerAssetPath('John Smith — Vol. 1.pdf', '/catreader/')).toBe(
      '/catreader/reader/John_Smith___Vol._1.pdf.json',
    );
  });

  it('accepts generated page payloads', () => {
    expect(parseReaderPayload({ version: 1, pages: ['<p>Uno</p>', ''] })).toEqual([
      '<p>Uno</p>',
      '',
    ]);
    expect(parseReaderPayload({ pages: [] })).toBeNull();
    expect(parseReaderPayload({ pages: ['', '  '] })).toBeNull();
  });

  it('keeps old IndexedDB ghost-text formats readable', () => {
    expect(parseStoredReaderText('["<p>Uno</p>",""]')).toEqual(['<p>Uno</p>', '']);
    expect(parseStoredReaderText('[Page 1]\nUno\n[Page 2]\nDos')).toEqual(['Uno\n', 'Dos']);
    expect(parseStoredReaderText('texto plano')).toEqual(['texto plano']);
  });
});
