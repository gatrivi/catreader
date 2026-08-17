import { describe, expect, it, vi } from 'vitest';
import { runCriticalSelfTest, summarizeCovers } from './healthCheck';

describe('summarizeCovers', () => {
  it('separates real, custom, synthetic and missing covers', () => {
    const library = [
      { filename: 'real.pdf', type: 'pdf', coverSource: { type: 'wikimedia', url: 'https://commons.example/a.jpg' } },
      { filename: 'custom.pdf', type: 'pdf', coverSource: { type: 'user-custom' } },
      { filename: 'synthetic.pdf', type: 'pdf', coverSource: { type: 'bundled' } },
      { filename: 'missing.pdf', type: 'pdf' },
    ];
    const covers = {
      'custom.pdf': 'data:image/jpeg;base64,xx',
      'synthetic.pdf': '<svg></svg>',
    };

    expect(summarizeCovers(library, covers)).toEqual({
      total: 4,
      real: 1,
      custom: 1,
      synthetic: 1,
      missing: 1,
    });
  });
});

describe('runCriticalSelfTest', () => {
  it('passes library, book asset, covers and Discover checks for a healthy deployment', async () => {
    const books = [
      { filename: 'a.pdf', type: 'pdf', coverSource: { type: 'wikimedia', url: 'https://commons.example/a.jpg' } },
      { filename: 'b.epub', type: 'epub', coverSource: { type: 'openlibrary', url: 'https://covers.example/b.jpg' } },
      { filename: 'c.txt', type: 'txt' },
    ];
    const feed = { items: [{ filename: 'a.pdf' }, { filename: 'b.epub' }] };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('books.json')) return { ok: true, status: 200, json: async () => books } as Response;
      if (url.endsWith('feed.json')) return { ok: true, status: 200, json: async () => feed } as Response;
      if (init?.method === 'HEAD' && url.includes('/books/')) return { ok: true, status: 200 } as Response;
      throw new Error(`unexpected ${url}`);
    });

    const results = await runCriticalSelfTest({
      baseUrl: '/',
      fetcher: fetcher as typeof fetch,
      imageLoader: async () => true,
      online: true,
      serviceWorkerControlled: true,
    });

    expect(results.find((result) => result.id === 'books-manifest')?.status).toBe('pass');
    expect(results.find((result) => result.id === 'book-assets')?.status).toBe('pass');
    expect(results.find((result) => result.id === 'cover-manifest')?.status).toBe('pass');
    expect(results.find((result) => result.id === 'cover-images')?.status).toBe('pass');
    expect(results.find((result) => result.id === 'discover-feed')?.status).toBe('pass');
  });

  it('fails clearly when feed references a missing book', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('books.json')) {
        return { ok: true, status: 200, json: async () => [{ filename: 'a.pdf', type: 'pdf' }] } as Response;
      }
      if (url.endsWith('feed.json')) {
        return { ok: true, status: 200, json: async () => ({ items: [{ filename: 'ghost.pdf' }] }) } as Response;
      }
      if (init?.method === 'HEAD') return { ok: true, status: 200 } as Response;
      throw new Error(`unexpected ${url}`);
    });

    const results = await runCriticalSelfTest({
      baseUrl: '/',
      fetcher: fetcher as typeof fetch,
      imageLoader: async () => true,
      online: true,
      serviceWorkerControlled: true,
    });

    expect(results.find((result) => result.id === 'discover-feed')).toMatchObject({ status: 'fail' });
  });
});
