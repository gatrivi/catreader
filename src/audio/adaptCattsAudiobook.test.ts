import { describe, it, expect } from 'vitest';
import { adaptAudiobookMeta } from './adaptCattsAudiobook';
import type { AudiobookMeta } from '../services/catts';

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:03,500
Hail Mary,

2
00:00:03,500 --> 00:00:06,000
full of grace.`;

const meta: AudiobookMeta = {
  id: 'KEEP_Rosary',
  title: 'Secret of the Rosary',
  chapters_detail: [
    { n: 1, title: 'Intro', has_subtitles: true },
    { n: 2, title: 'Decade I' },
  ],
};

describe('adaptAudiobookMeta', () => {
  it('maps one asset per chapter with relative audio src', () => {
    const m = adaptAudiobookMeta(meta);
    expect(m.schemaVersion).toBe(1);
    expect(m.work.kind).toBe('book');
    expect(m.work.id).toBe('KEEP_Rosary');
    expect(m.assets).toHaveLength(2);
    expect(m.chapters).toHaveLength(2);
    expect(m.assets[0].id).toBe('KEEP_Rosary:ch-1');
    expect(m.assets[0].src).toBe('/books/KEEP_Rosary/chapters/1/audio');
    expect(m.assets[0].source.scheme).toBe('block');
    expect(m.chapters[1].title).toBe('Decade I');
  });

  it('uses pdf-page source when pageRanges provided', () => {
    const m = adaptAudiobookMeta(meta, {
      pageRanges: { 1: { startPage: 1, endPage: 10 }, 2: { startPage: 11, endPage: 20 } },
    });
    expect(m.assets[0].source).toEqual({ scheme: 'pdf-page', startPage: 1, endPage: 10 });
    expect(m.chapters[1].source).toEqual({ scheme: 'pdf-page', startPage: 11, endPage: 20 });
  });

  it('parses SRT into cues and durationMs', () => {
    const m = adaptAudiobookMeta(meta, { srtByChapter: { 1: SAMPLE_SRT } });
    expect(m.assets[0].cues).toHaveLength(2);
    expect(m.assets[0].cues![0].startMs).toBe(1000);
    expect(m.assets[0].durationMs).toBe(6000);
    expect(m.assets[1].cues).toBeUndefined();
  });
});
