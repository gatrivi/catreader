import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildFragmentReport,
  clearFragmentReports,
  loadFragmentReports,
  REPORT_REASON_LABELS,
  saveFragmentReport,
} from './fragmentReports';
import type { ReadingFeedItem } from './readingFeed';

const item: ReadingFeedItem = {
  id: 'feed-1',
  bookId: 'book-1',
  filename: 'book.pdf',
  type: 'pdf',
  title: 'Libro',
  author: 'Autor',
  text: 'Un fragmento de prueba.',
  locator: { kind: 'pdf', page: 12 },
};

describe('fragment reports', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores enough context to reproduce a broken feed item offline', () => {
    const report = buildFragmentReport(item, 'destination', 'v2.10.15', 'Lleva a otra página');
    const reports = saveFragmentReport(report);

    expect(reports).toHaveLength(1);
    expect(loadFragmentReports()[0]).toMatchObject({
      feedItemId: 'feed-1',
      filename: 'book.pdf',
      text: item.text,
      reason: 'destination',
      note: 'Lleva a otra página',
      locator: { kind: 'pdf', page: 12 },
    });
  });

  it('survives malformed local storage without breaking the feed', () => {
    localStorage.setItem('catreader_fragment_reports', '{bad json');
    expect(loadFragmentReports()).toEqual([]);
    clearFragmentReports();
    expect(loadFragmentReports()).toEqual([]);
  });

  it('offers separate reasons for the main extraction failures', () => {
    expect(Object.keys(REPORT_REASON_LABELS)).toEqual([
      'cut',
      'noise',
      'destination',
      'does-not-open',
      'duplicate',
      'other',
    ]);
  });
});
