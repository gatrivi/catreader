import { describe, it, expect, beforeEach } from 'vitest';
import {
  progressRatioFromStored,
  loadLocalProgressMap,
  readLocalProgressRatio,
} from './localProgress';

describe('localProgress', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses page/numPages when present', () => {
    expect(progressRatioFromStored({ page: 50, numPages: 100 })).toBe(0.5);
  });

  it('falls back to scrollRatio', () => {
    expect(progressRatioFromStored({ page: 1, scrollRatio: 0.4 })).toBe(0.4);
  });

  it('scans localStorage map', () => {
    localStorage.setItem(
      'catreader_progress_a.pdf',
      JSON.stringify({ page: 10, numPages: 40, scrollRatio: 0 })
    );
    localStorage.setItem('other', 'x');
    expect(loadLocalProgressMap()['a.pdf']).toBe(0.25);
  });

  it('reads one file', () => {
    localStorage.setItem(
      'catreader_progress_b.pdf',
      JSON.stringify({ page: 2, scrollRatio: 0.1 })
    );
    expect(readLocalProgressRatio('b.pdf')).toBe(0.1);
  });
});
