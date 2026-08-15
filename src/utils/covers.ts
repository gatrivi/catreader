/** Cover sacredness helpers — protect real/user covers, but allow synthetic SVGs to upgrade. */

export type CoverSourceType =
  | 'user-custom'
  | 'ai-generated'
  | 'openlibrary'
  | 'google-books'
  | 'wikimedia'
  | 'bundled';

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
