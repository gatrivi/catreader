import { describe, it, expect } from 'vitest';
import {
  stainOpacity,
  stainsForPage,
  inkClass,
  wrapInkVariance,
  wrapInkVarianceHtml,
  applyInkVariance,
  paperSafeId,
  type PaperManifest,
} from './paperSoul';

describe('paperSoul', () => {
  it('stainOpacity peaks at center and falls off', () => {
    const peak = stainOpacity(5, 5, 2, 0.5);
    const near = stainOpacity(6, 5, 2, 0.5);
    const far = stainOpacity(20, 5, 2, 0.5);
    expect(peak).toBeCloseTo(0.5);
    expect(near).toBeLessThan(peak);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeLessThan(0.02);
  });

  it('stainsForPage returns top 3 above floor', () => {
    const manifest: PaperManifest = {
      seed: 'x',
      bookId: 'a.txt',
      paletteTint: '#f4ead5',
      stains: [
        { id: 'a', page_center: 1, radius_pages: 1, x: 0.1, y: 0.1, r_px: 80, intensity: 0.4, src: 'a.svg' },
        { id: 'b', page_center: 1, radius_pages: 2, x: 0.5, y: 0.5, r_px: 80, intensity: 0.3, src: 'b.svg' },
        { id: 'c', page_center: 1, radius_pages: 3, x: 0.8, y: 0.8, r_px: 80, intensity: 0.2, src: 'c.svg' },
        { id: 'd', page_center: 50, radius_pages: 1, x: 0.2, y: 0.2, r_px: 80, intensity: 0.9, src: 'd.svg' },
      ],
    };
    const active = stainsForPage(manifest, 1);
    expect(active).toHaveLength(3);
    expect(active[0].opacity).toBeGreaterThanOrEqual(active[1].opacity);
    expect(active.every((s) => s.stain.id !== 'd')).toBe(true);
  });

  it('inkClass is deterministic 0–7', () => {
    expect(inkClass(65, 0)).toBe(inkClass(65, 0));
    expect(inkClass(65, 0)).toBeGreaterThanOrEqual(0);
    expect(inkClass(65, 0)).toBeLessThanOrEqual(7);
  });

  it('wrapInkVariance wraps non-space chars', () => {
    const html = wrapInkVariance('Ab ');
    expect(html).toContain('class="ink-');
    expect(html).toContain('>A</span>');
    expect(html.endsWith(' ')).toBe(true);
  });

  it('wrapInkVarianceHtml wraps words, keeps tags', () => {
    const html = wrapInkVarianceHtml('<p>Hello world</p>');
    expect(html).toContain('<p>');
    expect(html).toContain('class="ink-');
    expect(html).toContain('>Hello</span>');
    expect(html).toContain('>world</span>');
  });

  it('applyInkVariance picks path by content', () => {
    expect(applyInkVariance('Hi').includes('ink-')).toBe(true);
    expect(applyInkVariance('<em>Hi</em>')).toContain('<em>');
  });

  it('paperSafeId sanitizes', () => {
    expect(paperSafeId('Foo Bar (1).txt')).toBe('Foo_Bar__1_.txt');
  });
});
