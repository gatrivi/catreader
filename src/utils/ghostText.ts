/** Truly lazy ghost-text windows — docs/READER_MODE_LAZY.md */

export const GHOST_WINDOW = 2;

/** 1-based page numbers around center (inclusive). */
export function pagesNeededAround(
  centerPage: number,
  totalPages: number,
  window: number = GHOST_WINDOW
): number[] {
  if (totalPages <= 0) return [];
  const c = Math.min(Math.max(1, centerPage || 1), totalPages);
  const lo = Math.max(1, c - window);
  const hi = Math.min(totalPages, c + window);
  const out: number[] = [];
  for (let p = lo; p <= hi; p++) out.push(p);
  return out;
}

/** Pages in `needed` that are empty / missing in sparse array (0-based store). */
export function missingGhostPages(pages: (string | null | undefined)[], needed: number[]): number[] {
  return needed.filter((p) => {
    const html = pages[p - 1];
    return !html || !String(html).trim();
  });
}

export function emptyGhostPages(totalPages: number): string[] {
  return Array.from({ length: Math.max(0, totalPages) }, () => '');
}

/** Merge extracted HTML into a copy of the sparse page array. */
export function applyGhostPages(
  pages: string[],
  extracted: Record<number, string>
): string[] {
  const next = [...pages];
  for (const [pStr, html] of Object.entries(extracted)) {
    const p = Number(pStr);
    if (p >= 1 && p <= next.length) next[p - 1] = html;
  }
  return next;
}
