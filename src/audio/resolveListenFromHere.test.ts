import { describe, it, expect } from 'vitest';
import { adaptAudiobookMeta } from './adaptCattsAudiobook';
import { resolveListenFromHere } from './resolveListenFromHere';
import type { AudiobookMeta } from '../services/catts';
import type { AudioManifestV1 } from './manifest.v1';

const meta: AudiobookMeta = {
  id: 'book-a',
  title: 'Book A',
  chapters_detail: [
    { n: 1, title: 'One' },
    { n: 2, title: 'Two' },
    { n: 3, title: 'Three' },
  ],
};

function pdfManifest(): AudioManifestV1 {
  return adaptAudiobookMeta(meta, {
    pageRanges: {
      1: { startPage: 1, endPage: 10 },
      2: { startPage: 11, endPage: 20 },
      3: { startPage: 21, endPage: 30 },
    },
    srtByChapter: {
      2: `1
00:00:05,000 --> 00:00:10,000
Middle chapter.`,
    },
  });
}

describe('resolveListenFromHere', () => {
  it('PDF page inside range → chapter-start (no per-cue page)', () => {
    const r = resolveListenFromHere(pdfManifest(), { scheme: 'pdf-page', page: 12 });
    expect(r).toMatchObject({
      match: 'chapter-start',
      assetId: 'book-a:ch-2',
      chapterId: 'chapter-2',
      startAtMs: 0,
    });
  });

  it('PDF page outside all ranges → nearest by midpoint', () => {
    const r = resolveListenFromHere(pdfManifest(), { scheme: 'pdf-page', page: 100 });
    expect(r?.match).toBe('nearest');
    expect(r?.assetId).toBe('book-a:ch-3');
    expect(r?.startAtMs).toBe(0);
  });

  it('PDF with cue-level pdf-page source → exact + startAtMs', () => {
    const m = pdfManifest();
    const asset = m.assets.find((a) => a.id === 'book-a:ch-2')!;
    asset.cues = [
      {
        startMs: 5000,
        endMs: 10000,
        source: { scheme: 'pdf-page', startPage: 12, endPage: 12 },
        textHash: 'x',
      },
    ];
    const r = resolveListenFromHere(m, { scheme: 'pdf-page', page: 12 });
    expect(r).toMatchObject({
      match: 'exact',
      assetId: 'book-a:ch-2',
      startAtMs: 5000,
    });
  });

  it('EPUB exact CFI match', () => {
    const m = adaptAudiobookMeta(meta);
    m.assets[0].source = { scheme: 'epub-cfi', start: 'epubcfi(/6/4!)' };
    m.assets[1].source = { scheme: 'epub-cfi', start: 'epubcfi(/6/8!)' };
    m.chapters[0].source = m.assets[0].source;
    m.chapters[1].source = m.assets[1].source;
    const r = resolveListenFromHere(m, { scheme: 'epub-cfi', cfi: 'epubcfi(/6/8!)' });
    expect(r).toMatchObject({
      match: 'exact',
      assetId: 'book-a:ch-2',
      startAtMs: 0,
    });
  });

  it('EPUB unknown CFI → chapter-start first', () => {
    const m = adaptAudiobookMeta(meta);
    m.assets[0].source = { scheme: 'epub-cfi', start: 'epubcfi(/6/4!)' };
    const r = resolveListenFromHere(m, { scheme: 'epub-cfi', cfi: 'epubcfi(/6/99!)' });
    expect(r).toMatchObject({
      match: 'chapter-start',
      assetId: 'book-a:ch-1',
      startAtMs: 0,
    });
  });

  it('empty manifest → null', () => {
    const empty: AudioManifestV1 = {
      schemaVersion: 1,
      work: { id: 'x', revision: 'r', kind: 'book', title: 'x', language: 'en' },
      voice: { provider: 'catts', id: 'legacy', settingsHash: 'legacy' },
      assets: [],
      chapters: [],
    };
    expect(resolveListenFromHere(empty, { scheme: 'pdf-page', page: 1 })).toBeNull();
  });
});
