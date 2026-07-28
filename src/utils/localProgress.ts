/** localStorage progress → cover aura ratio (0..1). FEATURE #1 adjacent. */

const PROGRESS_PREFIX = 'catreader_progress_';

export type ProgressSnapshot = {
  page: number;
  /** Prefer page/numPages when known; else scrollRatio */
  ratio: number;
};

export function progressRatioFromStored(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const p = raw as { page?: number; scrollRatio?: number; numPages?: number };
  const page = typeof p.page === 'number' && p.page > 0 ? p.page : 0;
  if (typeof p.numPages === 'number' && p.numPages > 0 && page > 0) {
    return Math.min(1, page / p.numPages);
  }
  if (typeof p.scrollRatio === 'number' && p.scrollRatio > 0) {
    return Math.min(1, Math.max(0, p.scrollRatio));
  }
  // Unknown length: treat page>1 as in-progress signal (cap soft)
  if (page > 1) return Math.min(0.95, page / Math.max(page + 20, 100));
  if (page === 1) return 0.02;
  return 0;
}

/** Scan all catreader_progress_* keys. */
export function loadLocalProgressMap(
  storage: Storage = localStorage
): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(PROGRESS_PREFIX)) continue;
    const filename = key.slice(PROGRESS_PREFIX.length);
    if (!filename) continue;
    try {
      const raw = JSON.parse(storage.getItem(key) || 'null');
      const ratio = progressRatioFromStored(raw);
      if (ratio > 0) out[filename] = ratio;
    } catch {
      /* ignore corrupt */
    }
  }
  return out;
}

export function readLocalProgressRatio(
  filename: string,
  storage: Storage = localStorage
): number {
  try {
    const raw = JSON.parse(storage.getItem(PROGRESS_PREFIX + filename) || 'null');
    return progressRatioFromStored(raw);
  } catch {
    return 0;
  }
}
