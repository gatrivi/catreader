/** Cover sacredness helpers — protect real/user covers, but allow synthetic SVGs to upgrade. */

export type CoverSourceType =
  | 'user-custom'
  | 'ai-generated'
  | 'openlibrary'
  | 'google-books'
  | 'wikimedia'
  | 'bundled';

export type CoverSource = {
  type?: CoverSourceType | string;
  url?: string;
  updatedAt?: number;
} | null | undefined;

export function isUserCustomCover(coverSource?: { type?: string } | null): boolean {
  return coverSource?.type === 'user-custom';
}

/** Any stored cover (data URL, http(s), raw SVG) counts as existing. */
export function hasStoredCover(cover: string | null | undefined): boolean {
  if (!cover || !cover.trim()) return false;
  return (
    cover.startsWith('data:') ||
    cover.startsWith('http://') ||
    cover.startsWith('https://') ||
    cover.includes('<svg')
  );
}

/** Legacy/generated SVGs are placeholders and may be upgraded to a real cover. */
export function isSyntheticCover(
  cover: string | null | undefined,
  coverSource?: { type?: string } | null,
): boolean {
  return (
    coverSource?.type === 'ai-generated' ||
    coverSource?.type === 'bundled' ||
    !!cover?.includes('<svg') ||
    !!cover?.startsWith('data:image/svg')
  );
}

function isSyntheticSource(source: CoverSource): boolean {
  return source?.type === 'ai-generated' || source?.type === 'bundled';
}

/**
 * Pick the source that should win when the shipped catalogue and persisted
 * metadata disagree. User covers are sacred. For static books, real artwork
 * declared in books.json is canonical so shipped cover corrections cannot be
 * hidden forever by stale automatically-enriched cache entries.
 */
export function preferredCoverSource(catalogue: CoverSource, persisted: CoverSource): CoverSource {
  if (persisted?.type === 'user-custom') return persisted;
  if (catalogue?.type === 'user-custom') return catalogue;
  if (!catalogue) return persisted;
  if (!persisted) return catalogue;

  const catalogueSynthetic = isSyntheticSource(catalogue);
  const persistedSynthetic = isSyntheticSource(persisted);

  if (!catalogueSynthetic) return catalogue;
  if (!persistedSynthetic) return persisted;

  const catalogueUpdatedAt = catalogue.updatedAt || 0;
  const persistedUpdatedAt = persisted.updatedAt || 0;
  if (catalogueUpdatedAt && persistedUpdatedAt && catalogueUpdatedAt !== persistedUpdatedAt) {
    return catalogueUpdatedAt > persistedUpdatedAt ? catalogue : persisted;
  }

  return persisted;
}

/** A stale remote URL or synthetic placeholder should yield to the chosen source. */
export function shouldReplaceStoredCover(existingCover: string | null | undefined, source: CoverSource): boolean {
  if (!existingCover || !source) return false;
  if (source.type === 'user-custom') return false;
  if (source.url && /^https?:\/\//.test(existingCover) && existingCover !== source.url) return true;
  if (source.url && isSyntheticCover(existingCover)) return true;
  return false;
}

/** Idle / auto fetch protects real or user covers, while allowing synthetic placeholders to upgrade. */
export function shouldSkipCoverFetch(opts: {
  force?: boolean;
  existingCover?: string | null;
  coverSource?: { type?: string } | null;
}): boolean {
  if (opts.force) return false;

  const sourceType = opts.coverSource?.type;
  if (sourceType === 'user-custom') return true;
  if (sourceType === 'openlibrary' || sourceType === 'google-books' || sourceType === 'wikimedia') return true;

  if (isSyntheticCover(opts.existingCover, opts.coverSource)) return false;
  return hasStoredCover(opts.existingCover);
}
