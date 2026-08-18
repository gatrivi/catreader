export interface CoverThumbEntry {
  filename: string;
  url: string;
}

const STORAGE_KEY = 'catreader_cover_thumbs_v1';
const WIDTH = 48;
const HEIGHT = 72;
const MAX_CONCURRENT = 2;

let cache: Record<string, string> = {};
try {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) cache = JSON.parse(raw);
  }
} catch {
  cache = {};
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
const inflight = new Map<string, Promise<string | null>>();
const queue: Array<() => void> = [];
let active = 0;

function schedulePersist() {
  if (typeof localStorage === 'undefined') return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // Storage is only a fast-path; remote/IDB cover remains available.
    }
  }, 250);
}

function runNext() {
  while (active < MAX_CONCURRENT && queue.length) {
    active += 1;
    queue.shift()?.();
  }
}

function scheduled<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => {
      void job().then(resolve, reject).finally(() => {
        active -= 1;
        runNext();
      });
    });
    runNext();
  });
}

export function getCoverThumb(filename: string): string | undefined {
  return cache[filename];
}

export function getAllCoverThumbs(): Record<string, string> {
  return { ...cache };
}

export function setCoverThumb(filename: string, dataUrl: string) {
  if (!dataUrl.startsWith('data:image/')) return;
  cache[filename] = dataUrl;
  schedulePersist();
}

async function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    // revoke after the current task so decoded pixels remain available to canvas
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

async function createTinyThumb(url: string): Promise<string | null> {
  if (!url.startsWith('http')) return null;
  const response = await fetch(url, { cache: 'force-cache', mode: 'cors' });
  if (!response.ok) return null;
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) return null;
  const image = await imageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);
  try {
    return canvas.toDataURL('image/webp', 0.72);
  } catch {
    return canvas.toDataURL('image/jpeg', 0.72);
  }
}

export function cacheCoverThumbnail(filename: string, url: string): Promise<string | null> {
  const existing = cache[filename];
  if (existing) return Promise.resolve(existing);
  const current = inflight.get(filename);
  if (current) return current;

  const promise = scheduled(async () => {
    try {
      const thumb = await createTinyThumb(url);
      if (thumb) setCoverThumb(filename, thumb);
      return thumb;
    } catch {
      return null;
    }
  }).finally(() => inflight.delete(filename));

  inflight.set(filename, promise);
  return promise;
}

export function primeCoverThumbnails(
  entries: CoverThumbEntry[],
  onReady?: (filename: string, dataUrl: string) => void,
) {
  const start = () => {
    for (const { filename, url } of entries) {
      if (cache[filename] || !url?.startsWith('http')) continue;
      void cacheCoverThumbnail(filename, url).then((thumb) => {
        if (thumb) onReady?.(filename, thumb);
      });
    }
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(start, { timeout: 2500 });
  } else {
    setTimeout(start, 1200);
  }
}
