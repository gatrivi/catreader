import type { ReadingProgress } from '../services/syncService';

/**
 * FEATURE #1 GUARDS — pure helpers.
 * NEVER let a transient UI remount / race persist a fake early page.
 */

/** Observer must not rewrite page during restore or any remount freeze. */
export function shouldBlockPageObserver(
  isRestoring: boolean,
  restoreTargetPage: number | null
): boolean {
  return isRestoring || restoreTargetPage != null;
}

/** Block autosave while restoring unless explicitly forced (e.g. close book). */
export function shouldBlockProgressSave(
  isRestoring: boolean,
  force = false
): boolean {
  return !force && isRestoring;
}

/**
 * Merge local + cloud progress.
 * NEVER accept a “newer” remote that looks like a false reset to page 1–3
 * when the other side was much further along (classic mode-switch clobber).
 */
export function mergeReadingProgress(
  local: ReadingProgress | null,
  cloud: ReadingProgress | null
): ReadingProgress | null {
  if (!local) return cloud;
  if (!cloud) return local;

  const localPage = local.page || 1;
  const cloudPage = cloud.page || 1;
  const localAt = local.updatedAt || 0;
  const cloudAt = cloud.updatedAt || 0;

  const newer = cloudAt > localAt ? cloud : local;
  const older = newer === cloud ? local : cloud;
  const newerPage = newer.page || 1;
  const olderPage = older.page || 1;

  // False reset: newer claims early pages, older was deep in the book
  if (newerPage <= 3 && olderPage > newerPage + 2) {
    return {
      ...newer,
      page: olderPage,
      scrollRatio: older.scrollRatio ?? newer.scrollRatio,
      epubCfi: older.epubCfi || newer.epubCfi,
    };
  }

  // Near-simultaneous race: cloud “wins” clock but regresses page a lot
  if (
    newer === cloud &&
    localPage > cloudPage + 5 &&
    Math.abs(cloudAt - localAt) < 60_000
  ) {
    return {
      ...cloud,
      page: localPage,
      scrollRatio: local.scrollRatio ?? cloud.scrollRatio,
      epubCfi: local.epubCfi || cloud.epubCfi,
    };
  }

  return newer;
}

/** Prefer explicit navigate / restore target over a lower observer flicker. */
export function resolvePageToPersist(
  currentPage: number,
  restoreTargetPage: number | null,
  lastCommittedPage: number
): number {
  if (restoreTargetPage != null && restoreTargetPage > 0) {
    return Math.max(currentPage, restoreTargetPage, lastCommittedPage);
  }
  // If current suddenly collapsed vs last committed without an explicit jump,
  // keep the higher committed page (caller decides when to update committed).
  if (lastCommittedPage > 1 && currentPage < lastCommittedPage && currentPage <= 3) {
    return lastCommittedPage;
  }
  return currentPage;
}
