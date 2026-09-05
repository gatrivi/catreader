import { describe, expect, it } from 'vitest';
import { knownCoverFor, normalizeCoverLookupTitle, titleMatchScore } from './autoCover';

describe('auto cover lookup', () => {
  it('turns filename-like imported titles into useful search text', () => {
    expect(normalizeCoverLookupTitle('abecedario_espiritual_vol_1', 'abecedario_espiritual_vol_1.pdf'))
      .toBe('abecedario espiritual vol 1');
  });

  it('pins Abecedario Espiritual volume 1 to the known public-domain Google Books scan', () => {
    const result = knownCoverFor({
      filename: 'abecedario_espiritual_vol_1.pdf',
      title: 'Abecedario Espiritual Vol 1',
      author: 'Francisco de Osuna',
    });
    expect(result?.source).toBe('google-books');
    expect(result?.url).toContain('1jA8AAAAcAAJ');
  });

  it('still recognizes volume 1 when an imported book only has a placeholder author', () => {
    const result = knownCoverFor({
      filename: 'abecedario_espiritual_vol_1.pdf',
      title: 'abecedario_espiritual_vol_1',
      author: 'Desconocido',
    });
    expect(result?.url).toContain('1jA8AAAAcAAJ');
  });

  it('keeps volume 2 distinct from volume 1', () => {
    const result = knownCoverFor({
      filename: 'abecedario_espiritual_vol_2.pdf',
      title: 'Abecedario Espiritual Volumen 2',
      author: 'Francisco de Osuna',
    });
    expect(result?.url).toContain('5TA8AAAAcAAJ');
  });

  it('rejects unrelated search results by title overlap', () => {
    expect(titleMatchScore('Abecedario espiritual volumen 1', 'The Secret of Light')).toBe(0);
    expect(titleMatchScore('Abecedario espiritual volumen 1', 'Abecedario espiritual, Volumen 1')).toBe(1);
  });
});

describe('cover lookup resilience', () => {
  it('aborts stalled providers, releases the queue, and avoids immediate retries', async () => {
    const { vi } = await import('vitest');
    const { resolveAutoCover } = await import('./autoCover');
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const book = { filename: 'timeout-regression.pdf', title: 'Queue timeout regression' };
      const pending = resolveAutoCover(book);
      await vi.advanceTimersByTimeAsync(10001);
      expect(await pending).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(await resolveAutoCover(book)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
