/**
 * Resolve "Escuchar desde aquí" → asset + startAtMs (§9).
 * Returns match quality so UI never fakes precision.
 */
import type { AudioAsset, AudioManifestV1, ListenResolveResult, SourceRange } from './manifest.v1';

export type ListenLocator =
  | { scheme: 'pdf-page'; page: number }
  | { scheme: 'epub-cfi'; cfi: string };

function assetById(manifest: AudioManifestV1, id: string): AudioAsset | undefined {
  return manifest.assets.find((a) => a.id === id);
}

function chapterForAsset(manifest: AudioManifestV1, assetId: string) {
  return manifest.chapters.find((c) => c.assetIds.includes(assetId));
}

function pdfCovers(source: SourceRange | undefined, page: number): boolean {
  return !!source && source.scheme === 'pdf-page' && page >= source.startPage && page <= source.endPage;
}

/** Cue with its own pdf-page source covering `page` → exact startMs. */
function exactCueForPage(asset: AudioAsset, page: number): number | null {
  if (!asset.cues?.length) return null;
  const hit = asset.cues.find(
    (c) => c.source.scheme === 'pdf-page' && page >= c.source.startPage && page <= c.source.endPage
  );
  return hit ? hit.startMs : null;
}

function resolvePdf(manifest: AudioManifestV1, page: number): ListenResolveResult | null {
  // exact / chapter-start: asset whose pdf-page range contains page
  for (const asset of manifest.assets) {
    if (!pdfCovers(asset.source, page)) continue;
    const chapter = chapterForAsset(manifest, asset.id);
    if (!chapter) continue;
    const cueMs = exactCueForPage(asset, page);
    if (cueMs != null) {
      return { match: 'exact', assetId: asset.id, chapterId: chapter.id, startAtMs: cueMs };
    }
    return { match: 'chapter-start', assetId: asset.id, chapterId: chapter.id, startAtMs: 0 };
  }

  // nearest: closest pdf-page asset by startPage distance
  let best: { asset: AudioAsset; dist: number } | null = null;
  for (const asset of manifest.assets) {
    if (asset.source.scheme !== 'pdf-page') continue;
    const mid = (asset.source.startPage + asset.source.endPage) / 2;
    const dist = Math.abs(mid - page);
    if (!best || dist < best.dist) best = { asset, dist };
  }
  if (best) {
    const chapter = chapterForAsset(manifest, best.asset.id);
    if (chapter) {
      return {
        match: 'nearest',
        assetId: best.asset.id,
        chapterId: chapter.id,
        startAtMs: 0,
      };
    }
  }

  // fallback: first chapter
  const first = manifest.chapters[0];
  const firstAssetId = first?.assetIds[0];
  if (first && firstAssetId) {
    return {
      match: 'chapter-start',
      assetId: firstAssetId,
      chapterId: first.id,
      startAtMs: 0,
    };
  }
  return null;
}

/** Crude CFI chapter hint: epubjs CFIs often embed spine href; match asset epub-cfi start prefix. */
function resolveEpub(manifest: AudioManifestV1, cfi: string): ListenResolveResult | null {
  const trimmed = cfi.trim();
  if (!trimmed) return resolvePdf(manifest, 1); // degenerate → first chapter path via empty

  for (const asset of manifest.assets) {
    if (asset.source.scheme !== 'epub-cfi') continue;
    const start = asset.source.start;
    const end = asset.source.end;
    if (trimmed === start || (end && trimmed === end)) {
      const chapter = chapterForAsset(manifest, asset.id);
      if (!chapter) continue;
      return { match: 'exact', assetId: asset.id, chapterId: chapter.id, startAtMs: 0 };
    }
    // containment: locator CFI shares prefix with asset range start
    if (trimmed.startsWith(start) || start.startsWith(trimmed.split('!')[0] || trimmed)) {
      const chapter = chapterForAsset(manifest, asset.id);
      if (!chapter) continue;
      return { match: 'nearest', assetId: asset.id, chapterId: chapter.id, startAtMs: 0 };
    }
  }

  const first = manifest.chapters[0];
  const firstAssetId = first?.assetIds[0];
  if (first && firstAssetId) {
    return {
      match: 'chapter-start',
      assetId: firstAssetId,
      chapterId: first.id,
      startAtMs: 0,
    };
  }
  return null;
}

/** Map reader location → playback start. Null only if manifest has no chapters. */
export function resolveListenFromHere(
  manifest: AudioManifestV1,
  locator: ListenLocator
): ListenResolveResult | null {
  if (locator.scheme === 'pdf-page') return resolvePdf(manifest, locator.page);
  return resolveEpub(manifest, locator.cfi);
}
