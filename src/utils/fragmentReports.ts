import type { FeedLocator, ReadingFeedItem } from './readingFeed';

export const FRAGMENT_REPORTS_KEY = 'catreader_fragment_reports';

export type FragmentReportReason =
  | 'cut'
  | 'noise'
  | 'destination'
  | 'does-not-open'
  | 'duplicate'
  | 'other';

export type FragmentReport = {
  id: string;
  createdAt: string;
  appVersion: string;
  reason: FragmentReportReason;
  note?: string;
  url: string;
  feedItemId: string;
  bookId: string;
  filename: string;
  title: string;
  author?: string;
  text: string;
  locator: FeedLocator;
};

export const REPORT_REASON_LABELS: Record<FragmentReportReason, string> = {
  cut: 'Está cortado o mal seleccionado',
  noise: 'Tiene ruido, OCR o índice',
  destination: 'No coincide con el destino',
  'does-not-open': 'No abre el libro',
  duplicate: 'Es un duplicado',
  other: 'Otro problema',
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadFragmentReports(): FragmentReport[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(FRAGMENT_REPORTS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveFragmentReport(report: FragmentReport): FragmentReport[] {
  const next = [...loadFragmentReports(), report];
  const storage = getStorage();
  if (!storage) throw new Error('Local storage unavailable');
  storage.setItem(FRAGMENT_REPORTS_KEY, JSON.stringify(next));
  return next;
}

export function clearFragmentReports() {
  getStorage()?.removeItem(FRAGMENT_REPORTS_KEY);
}

export function buildFragmentReport(
  item: ReadingFeedItem,
  reason: FragmentReportReason,
  appVersion: string,
  note = ''
): FragmentReport {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    appVersion,
    reason,
    ...(note.trim() ? { note: note.trim() } : {}),
    url: typeof window === 'undefined' ? '' : window.location.href,
    feedItemId: item.id,
    bookId: item.bookId,
    filename: item.filename,
    title: item.title,
    author: item.author,
    text: item.text,
    locator: item.locator,
  };
}

export function fragmentReportsJson(reports = loadFragmentReports()) {
  return JSON.stringify(reports, null, 2);
}
