/**
 * AudioManifestV1 — mirror of CAT_AUDIO_ENGINE_SPEC §5.
 * Shared package will own this; keep in sync until then.
 */

export type SourceRange =
  | {
      scheme: 'block';
      contentId: string;
      startBlockId: string;
      endBlockId?: string;
    }
  | {
      scheme: 'epub-cfi';
      start: string;
      end?: string;
    }
  | {
      scheme: 'pdf-page';
      startPage: number;
      endPage: number;
    };

export type AudioCue = {
  startMs: number;
  endMs: number;
  source: SourceRange;
  textHash: string;
};

export type AudioAsset = {
  id: string;
  revision: string;
  src: string;
  mimeType: string;
  durationMs: number;
  source: SourceRange;
  timings?: {
    json?: string;
    vtt?: string;
  };
  /** In-memory cues when SRT was adapted (not part of wire schema). */
  cues?: AudioCue[];
};

export type AudioChapter = {
  id: string;
  title: string;
  assetIds: string[];
  source?: SourceRange;
};

export type AudioManifestV1 = {
  schemaVersion: 1;
  work: {
    id: string;
    revision: string;
    kind: 'prayer' | 'devotion' | 'book';
    title: string;
    language: string;
  };
  voice: {
    provider: string;
    id: string;
    settingsHash: string;
  };
  assets: AudioAsset[];
  chapters: AudioChapter[];
};

export type ListenMatch = 'exact' | 'nearest' | 'chapter-start';

export type ListenResolveResult = {
  match: ListenMatch;
  assetId: string;
  chapterId: string;
  startAtMs: number;
};
