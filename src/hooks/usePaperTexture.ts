import { useEffect, useMemo, useState } from 'react';
import {
  stainsForPage,
  type ActiveStain,
  type PaperManifest,
} from '../utils/paperSoul';

const cache = new Map<string, PaperManifest>();

async function loadManifest(path: string): Promise<PaperManifest | null> {
  if (cache.has(path)) return cache.get(path)!;
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const data = (await res.json()) as PaperManifest;
    cache.set(path, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Resolves which stain blobs apply to the current page.
 * `paperPath` is books.json `paper` field (manifest URL), or null.
 */
export function usePaperTexture(
  paperPath: string | null | undefined,
  page: number,
  enabled: boolean
): { manifest: PaperManifest | null; active: ActiveStain[]; grainUrl: string } {
  const [manifest, setManifest] = useState<PaperManifest | null>(null);

  useEffect(() => {
    if (!enabled || !paperPath) {
      setManifest(null);
      return;
    }
    let cancelled = false;
    loadManifest(paperPath).then((m) => {
      if (!cancelled) setManifest(m);
    });
    return () => {
      cancelled = true;
    };
  }, [paperPath, enabled]);

  // Prefetch adjacent pages' stain assets (tiny; free)
  useEffect(() => {
    if (!enabled || !manifest) return;
    const warm = [...stainsForPage(manifest, page), ...stainsForPage(manifest, page + 1)];
    for (const { stain } of warm) {
      const img = new Image();
      img.src = stain.src.startsWith('/') ? stain.src : new URL(stain.src, paperPath || undefined).href;
    }
  }, [manifest, page, enabled, paperPath]);

  const active = useMemo(() => stainsForPage(manifest, page), [manifest, page]);

  return {
    manifest,
    active,
    grainUrl: '/paper/grain.svg',
  };
}
