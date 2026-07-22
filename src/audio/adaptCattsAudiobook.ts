/**
 * Bridge legacy CatTS GET /books meta → AudioManifestV1.
 * Auth stays on fetch(blob); src is a relative path, not a playable naked URL.
 */
import type { AudiobookMeta, AudiobookChapter } from '../services/catts';
import { parseSrt } from '../utils/srt';
import type { AudioAsset, AudioChapter, AudioCue, AudioManifestV1, SourceRange } from './manifest.v1';
import { hashText } from '../utils/sentences';

export type ChapterPageRange = { startPage: number; endPage: number };

export type AdaptAudiobookOptions = {
  language?: string;
  voice?: AudioManifestV1['voice'];
  /** Optional PDF page coverage per 1-based chapter n */
  pageRanges?: Record<number, ChapterPageRange>;
  /** Optional raw SRT keyed by chapter n — becomes in-memory cues */
  srtByChapter?: Record<number, string>;
  revision?: string;
};

function chapterIndex(ch: AudiobookChapter, i: number): number {
  return ch.n ?? i + 1;
}

function blockSource(workId: string, chapterN: number): SourceRange {
  const id = `ch-${chapterN}`;
  return {
    scheme: 'block',
    contentId: workId,
    startBlockId: id,
    endBlockId: id,
  };
}

function pageSource(range: ChapterPageRange): SourceRange {
  return {
    scheme: 'pdf-page',
    startPage: range.startPage,
    endPage: range.endPage,
  };
}

function srtToCues(srt: string, fallbackSource: SourceRange): AudioCue[] {
  return parseSrt(srt).map((c) => ({
    startMs: Math.round(c.start * 1000),
    endMs: Math.round(c.end * 1000),
    source: fallbackSource,
    textHash: hashText(c.text),
  }));
}

/** Map CatTS audiobook meta to AudioManifestV1 (one asset per chapter). */
export function adaptAudiobookMeta(
  meta: AudiobookMeta,
  opts: AdaptAudiobookOptions = {}
): AudioManifestV1 {
  const workId = meta.id;
  const revision = opts.revision ?? 'legacy';
  const assets: AudioAsset[] = [];
  const chapters: AudioChapter[] = [];

  for (let i = 0; i < (meta.chapters_detail?.length ?? 0); i++) {
    const ch = meta.chapters_detail[i];
    const n = chapterIndex(ch, i);
    const assetId = `${workId}:ch-${n}`;
    const range = opts.pageRanges?.[n];
    const source = range ? pageSource(range) : blockSource(workId, n);
    const srt = opts.srtByChapter?.[n];
    // SRT has no fine SourceRange yet — keep block so locator reports chapter-start/nearest, not fake exact
    const cueSource = blockSource(workId, n);
    const cues = srt ? srtToCues(srt, cueSource) : undefined;
    const durationMs =
      cues && cues.length > 0 ? Math.max(...cues.map((c) => c.endMs)) : 0;

    const asset: AudioAsset = {
      id: assetId,
      revision,
      src: ch.audio_url || `/books/${encodeURIComponent(workId)}/chapters/${n}/audio`,
      mimeType: 'audio/mpeg',
      durationMs,
      source,
      ...(cues ? { cues } : {}),
    };
    assets.push(asset);

    chapters.push({
      id: `chapter-${n}`,
      title: ch.title || `Chapter ${n}`,
      assetIds: [assetId],
      source,
    });
  }

  return {
    schemaVersion: 1,
    work: {
      id: workId,
      revision,
      kind: 'book',
      title: meta.title || workId,
      language: opts.language || 'en',
    },
    voice: opts.voice ?? {
      provider: 'catts',
      id: 'legacy',
      settingsHash: 'legacy',
    },
    assets,
    chapters,
  };
}
