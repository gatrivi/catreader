import { describe, it, expect } from 'vitest';
import {
  slugify,
  buildBookPath,
  parseBookPath,
  matchBookBySlug,
  parseBookQuery,
  resolveBookRoute,
} from './routing';

describe('routing', () => {
  it('slugifies titles', () => {
    expect(slugify('Church History')).toBe('church-history');
    expect(slugify('  Meditations!! ')).toBe('meditations');
  });

  it('builds open-book paths with optional page', () => {
    expect(buildBookPath('Church', 'meditations.pdf')).toBe('/church/meditations');
    expect(buildBookPath('Church', 'meditations.pdf', 1)).toBe('/church/meditations');
    expect(buildBookPath('Church', 'meditations.pdf', 20)).toBe('/church/meditations/20');
    expect(buildBookPath('Church', 'meditations.pdf', 20, 2)).toBe('/church/meditations/20/2');
  });

  it('parses book paths for deep-link open', () => {
    expect(parseBookPath('/')).toBe(null);
    expect(parseBookPath('/church/meditations')).toEqual({
      shelfSlug: 'church',
      bookSlug: 'meditations',
      page: undefined,
      quadrant: undefined,
    });
    expect(parseBookPath('/church/meditations/20')).toEqual({
      shelfSlug: 'church',
      bookSlug: 'meditations',
      page: 20,
      quadrant: undefined,
    });
    expect(parseBookPath('/church/meditations/20/3')).toEqual({
      shelfSlug: 'church',
      bookSlug: 'meditations',
      page: 20,
      quadrant: 3,
    });
  });

  it('matches library book by slug so open works', () => {
    const library = [
      { filename: 'Meditations.pdf' },
      { filename: 'church-history.pdf' },
    ];
    expect(matchBookBySlug(library, 'meditations')?.filename).toBe('Meditations.pdf');
    expect(matchBookBySlug(library, 'church-history')?.filename).toBe('church-history.pdf');
    expect(matchBookBySlug(library, 'missing')).toBeUndefined();
    expect(matchBookBySlug(library, 'x', 'Meditations.pdf')?.filename).toBe('Meditations.pdf');
  });

  it('parses legacy ?book= query open links', () => {
    expect(parseBookQuery('?book=Meditations.pdf&page=12')).toEqual({
      shelfSlug: 'library',
      bookSlug: 'meditations',
      rawFilename: 'Meditations.pdf',
      page: 12,
    });
    expect(parseBookQuery('')).toBe(null);
  });

  it('resolveBookRoute prefers path then query', () => {
    expect(resolveBookRoute('/church/meditations/5', '')?.page).toBe(5);
    expect(resolveBookRoute('/', '?book=foo.pdf&page=3')?.rawFilename).toBe('foo.pdf');
  });
});
