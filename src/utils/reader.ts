/** Page clamp / nav / PDF render-window helpers. */

export const PDF_RENDER_WINDOW = 8;

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

