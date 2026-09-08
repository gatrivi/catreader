import { afterEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { bookAssetUrl, pdfSource } from './pdfSource';

afterEach(() => vi.unstubAllGlobals());

function pdfResponse(body = '%PDF-1.7 net') {
  const blob = new NodeBlob([body]);
  return {
    ok: true,
    headers: { get: (k: string) => (k === 'Content-Length' ? String(blob.size) : null) },
    body: null,
    blob: async () => blob,
  };
}

describe('PDF sources', () => {
  it('escapes URL delimiters without breaking commas or base paths', () => {
    expect(bookAssetUrl('Title, part #1?.pdf', '/reader/')).toBe('/reader/books/Title,%20part%20%231%3F.pdf');
  });
  it('downloads an uncached PDF in one shot, caches it, and serves a blob URL', async () => {
    const fetch = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal('fetch', fetch);
    const createObjectURL = vi.fn(() => 'blob:downloaded');
    vi.stubGlobal('URL', { createObjectURL });
    const writeCache = vi.fn().mockResolvedValue(undefined);
    expect(await pdfSource('large.pdf', async () => null, { writeCache })).toBe('blob:downloaded');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/books/large.pdf');
    expect(writeCache).toHaveBeenCalledWith('large.pdf', expect.any(NodeBlob));
  });
  it('keeps a valid cached PDF available offline without touching the network', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const createObjectURL = vi.fn(() => 'blob:cached');
    vi.stubGlobal('URL', { createObjectURL });
    const blob = new NodeBlob(['%PDF-1.7 cached']) as unknown as Blob;
    expect(await pdfSource('cached.pdf', async () => blob)).toBe('blob:cached');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('falls back to the network URL when the download is not a real PDF', async () => {
    const fetch = vi.fn().mockResolvedValue(pdfResponse('<html>wrong response</html>'));
    vi.stubGlobal('fetch', fetch);
    const writeCache = vi.fn();
    expect(await pdfSource('bad.pdf', async () => null, { writeCache })).toBe('/books/bad.pdf');
    expect(writeCache).not.toHaveBeenCalled();
  });
  it('still opens when IndexedDB is unavailable', async () => {
    const fetch = vi.fn().mockResolvedValue(pdfResponse());
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:fresh' });
    expect(await pdfSource('book.pdf', async () => { throw Error('blocked'); })).toBe('blob:fresh');
  });
  it('falls back to the network URL when the download itself fails', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    expect(await pdfSource('book.pdf', async () => null)).toBe('/books/book.pdf');
  });
});
