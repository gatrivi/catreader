/** Page clamp / nav / PDF render-window helpers. */

export const PDF_RENDER_WINDOW = 2;

export function clampPage(page: number, numPages: number): number {
  if (numPages <= 0) return 1;
  return Math.min(Math.max(1, page), numPages);
}

export function offsetPage(page: number, offset: number, numPages: number): number {
  return clampPage(page + offset, numPages);
}

/** Whether a PDF page should mount react-pdf <Page> (lazy window around current). */
export function isPageInRenderWindow(
  page: number,
  currentPage: number,
  windowSize: number = PDF_RENDER_WINDOW
): boolean {
  return Math.abs(page - currentPage) <= windowSize;
}

export function parsePageInput(raw: string, numPages: number): number | null {
  const p = parseInt(raw, 10);
  if (isNaN(p) || p < 1 || p > numPages) return null;
  return p;
}

export function filterLibraryBooks<T extends { title: string; author?: string; filename: string }>(
  books: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return books;
  return books.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.author?.toLowerCase().includes(q) ||
      b.filename.toLowerCase().includes(q)
  );
}

/** Block IntersectionObserver page writes during open/restore or reader-mode switch. */
export {
  shouldBlockPageObserver,
  shouldBlockProgressSave,
  mergeReadingProgress,
  resolvePageToPersist,
} from './progressGuard';

/** DOM id prefix for the active continuous-scroll surface. */
export function pageElementPrefix(isReaderMode: boolean, fileType: string): string {
  return isReaderMode || fileType === 'txt' ? 'text-page-' : 'page-';
}


/** Best-effort memory of PDF page counts, learned on each successful open,
 * so "Sorpréndeme" can drop you at a random page instead of page 1. */
const PAGE_COUNTS_KEY = 'catreader_page_counts';

export function loadPageCounts(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PAGE_COUNTS_KEY) || '{}');
    if (typeof raw !== 'object' || raw === null) return {};
    const counts: Record<string, number> = {};
    for (const [filename, count] of Object.entries(raw)) {
      if (typeof count === 'number' && Number.isFinite(count) && count >= 1) {
        counts[filename] = Math.floor(count);
      }
    }
    return counts;
  } catch {
    return {};
  }
}

export function rememberPageCount(filename: string, numPages: number): void {
  if (!filename || numPages < 1) return;
  try {
    const counts = loadPageCounts();
    counts[filename] = numPages;
    localStorage.setItem(PAGE_COUNTS_KEY, JSON.stringify(counts));
  } catch {
    // storage unavailable — page memory is best-effort
  }
}

/** Indices [0..total-1] ordered outward from centerIndex — lets background
 * work fix the layout around the page being read before anywhere else. */
export function centerOutOrder(total: number, centerIndex: number): number[] {
  const order: number[] = [];
  if (total <= 0) return order;
  const center = Math.min(Math.max(0, centerIndex), total - 1);
  for (let d = 0; d < total; d++) {
    if (center - d >= 0) order.push(center - d);
    if (d > 0 && center + d < total) order.push(center + d);
  }
  return order;
}
