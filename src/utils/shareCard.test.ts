import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFragmentShareText, copyFragmentToClipboard, type FragmentShareCardInput } from './shareCard';

const input: FragmentShareCardInput = {
  item: {
    id: 'feed-1',
    bookId: 'book-1',
    filename: 'book.txt',
    type: 'txt',
    title: 'Libro',
    author: 'Autor',
    text: 'Un párrafo para compartir.',
    locator: { kind: 'txt', label: 'fragmento 1' },
  },
  book: { title: 'Libro', author: 'Autor', svg: undefined },
  shareUrl: 'https://catreader.gatrivi.com/feed',
};

describe('share card', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds social text with the paragraph, source and URL', () => {
    const text = buildFragmentShareText(input);
    expect(text).toContain('“Un párrafo para compartir.”');
    expect(text).toContain('Libro — Autor');
    expect(text).toContain('https://catreader.gatrivi.com/feed');
  });

  it('falls back to text when image clipboard is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const mode = await copyFragmentToClipboard(input, async () => {
      throw new Error('canvas unavailable');
    });

    expect(mode).toBe('text');
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Un párrafo para compartir.'));
  });
});
