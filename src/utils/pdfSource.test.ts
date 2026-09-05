import { afterEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { bookAssetUrl, pdfSource } from './pdfSource';

afterEach(() => vi.unstubAllGlobals());
describe('PDF sources', () => {
  it('escapes URL delimiters without breaking commas or base paths', () => {
    expect(bookAssetUrl('Title, part #1?.pdf', '/reader/')).toBe('/reader/books/Title,%20part%20%231%3F.pdf');
  });
  it('does not download an uncached PDF before handing it to the reader', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await pdfSource('large.pdf', async () => null)).toBe('/books/large.pdf');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps a valid cached PDF available offline', async () => {
    const createObjectURL = vi.fn(() => 'blob:cached');
    vi.stubGlobal('URL', { createObjectURL });
    const blob = new NodeBlob(['%PDF-1.7 cached']) as unknown as Blob;
    expect(await pdfSource('cached.pdf', async () => blob)).toBe('blob:cached');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });
  it('ignores an HTML fallback cached as a PDF', async () => {
    const blob = new NodeBlob(['<html>wrong response</html>'], { type: 'application/pdf' }) as unknown as Blob;
    expect(await pdfSource('bad.pdf', async () => blob)).toBe('/books/bad.pdf');
  });
  it('still opens when IndexedDB is unavailable', async () => {
    expect(await pdfSource('book.pdf', async () => { throw Error('blocked'); })).toBe('/books/book.pdf');
  });
});
