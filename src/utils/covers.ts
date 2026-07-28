/** Cover sacredness helpers — never clobber an existing cover unless force. */

export type CoverSourceType =
  | 'user-custom'
  | 'ai-generated'
  | 'openlibrary'
  | 'google-books'
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

/** Idle / auto fetch must skip when any cover already exists (unless force). */
export function shouldSkipCoverFetch(opts: {
  force?: boolean;
  existingCover?: string | null;
  coverSource?: { type?: string } | null;
}): boolean {
  if (opts.force) return false;
  // Any declared source (bundled/catalog/custom) is sacred for idle scan
  if (opts.coverSource?.type) return true;
  if (hasStoredCover(opts.existingCover)) return true;
  return false;
}
