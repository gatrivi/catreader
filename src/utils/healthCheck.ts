export type HealthStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheckResult {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
}

export interface RuntimeBookLike {
  filename: string;
  type: string;
  coverSource?: {
    type?: string;
    url?: string;
  };
}

export interface CoverStats {
  total: number;
  real: number;
  custom: number;
  synthetic: number;
  missing: number;
}

const REAL_SOURCES = new Set(['openlibrary', 'google-books', 'wikimedia']);
const SYNTHETIC_SOURCES = new Set(['ai-generated', 'bundled']);

export function summarizeCovers(
  library: RuntimeBookLike[],
  covers: Record<string, string>,
): CoverStats {
  const stats: CoverStats = { total: library.length, real: 0, custom: 0, synthetic: 0, missing: 0 };

  for (const book of library) {
    const source = book.coverSource?.type;
    const cover = covers[book.filename] || book.coverSource?.url || '';

    if (source === 'user-custom') {
      stats.custom += 1;
      continue;
    }

    if (
      REAL_SOURCES.has(source || '') ||
      /^https?:\/\//i.test(cover) ||
      (cover.startsWith('data:image/') && !cover.startsWith('data:image/svg'))
    ) {
      stats.real += 1;
      continue;
    }

    if (
      SYNTHETIC_SOURCES.has(source || '') ||
      cover.includes('<svg') ||
      cover.startsWith('data:image/svg')
    ) {
      stats.synthetic += 1;
      continue;
    }

    stats.missing += 1;
  }

  return stats;
}

interface ManifestBook {
  filename: string;
  type?: string;
  coverSource?: {
    type?: string;
    url?: string;
  };
}

interface FeedManifest {
  items?: Array<{ filename?: string }>;
}

export interface CriticalSelfTestOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  imageLoader?: (url: string) => Promise<boolean>;
  serviceWorkerControlled?: boolean;
  online?: boolean;
}

function assetUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${path.replace(/^\//, '')}`;
}

async function defaultImageLoader(url: string): Promise<boolean> {
  if (typeof Image === 'undefined') return false;
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(false), 7000);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    image.referrerPolicy = 'no-referrer';
    image.src = url;
  });
}

export async function runCriticalSelfTest(
  options: CriticalSelfTestOptions = {},
): Promise<HealthCheckResult[]> {
  const fetcher = options.fetcher || fetch;
  const imageLoader = options.imageLoader || defaultImageLoader;
  const baseUrl = options.baseUrl ?? ((import.meta as any).env?.BASE_URL || '/');
  const checks: HealthCheckResult[] = [];

  let books: ManifestBook[] = [];
  try {
    const response = await fetcher(assetUrl(baseUrl, 'books.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = await response.json();
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('manifest empty');
    books = parsed;
    checks.push({ id: 'books-manifest', label: 'Biblioteca', status: 'pass', detail: `${books.length} libros en books.json` });
  } catch (error) {
    checks.push({ id: 'books-manifest', label: 'Biblioteca', status: 'fail', detail: `books.json no carga: ${error instanceof Error ? error.message : String(error)}` });
  }

  if (books.length) {
    const realCovers = books.filter((book) => REAL_SOURCES.has(book.coverSource?.type || '') && /^https?:\/\//i.test(book.coverSource?.url || ''));
    checks.push({
      id: 'cover-manifest',
      label: 'Portadas reales',
      status: realCovers.length > 0 ? 'pass' : 'fail',
      detail: `${realCovers.length}/${books.length} libros declaran portada real remota`,
    });

    const sampleFiles: ManifestBook[] = [];
    const pdf = books.find((book) => book.type?.toLowerCase() === 'pdf');
    const epub = books.find((book) => book.type?.toLowerCase() === 'epub');
    const txt = books.find((book) => book.type?.toLowerCase() === 'txt');
    for (const book of [pdf, epub, txt]) {
      if (book && !sampleFiles.some((candidate) => candidate.filename === book.filename)) sampleFiles.push(book);
    }

    const assetFailures: string[] = [];
    for (const book of sampleFiles) {
      try {
        const response = await fetcher(assetUrl(baseUrl, `books/${encodeURIComponent(book.filename)}`), {
          method: 'HEAD',
          cache: 'no-store',
        });
        if (!response.ok) assetFailures.push(`${book.filename}: ${response.status}`);
      } catch (error) {
        assetFailures.push(`${book.filename}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    checks.push({
      id: 'book-assets',
      label: 'Archivos de libro',
      status: assetFailures.length ? 'fail' : 'pass',
      detail: assetFailures.length ? assetFailures.join(' · ') : `${sampleFiles.length} formatos muestreados disponibles`,
    });

    const distinctCoverUrls = [...new Set(realCovers.map((book) => book.coverSource?.url).filter((url): url is string => !!url))].slice(0, 3);
    if (distinctCoverUrls.length) {
      const loaded = await Promise.all(distinctCoverUrls.map((url) => imageLoader(url)));
      const ok = loaded.filter(Boolean).length;
      checks.push({
        id: 'cover-images',
        label: 'Imágenes de portada',
        status: ok === distinctCoverUrls.length ? 'pass' : ok > 0 ? 'warn' : 'fail',
        detail: `${ok}/${distinctCoverUrls.length} portadas remotas cargaron como imagen`,
      });
    }
  }

  try {
    const response = await fetcher(assetUrl(baseUrl, 'feed.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = await response.json() as FeedManifest;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    if (items.length === 0) throw new Error('feed empty');
    const known = new Set(books.map((book) => book.filename));
    const orphaned = books.length ? items.filter((item) => item.filename && !known.has(item.filename)).length : 0;
    checks.push({
      id: 'discover-feed',
      label: 'Descubrir',
      status: orphaned ? 'fail' : 'pass',
      detail: `${items.length} fragmentos${orphaned ? ` · ${orphaned} huérfanos` : ''}`,
    });
  } catch (error) {
    checks.push({ id: 'discover-feed', label: 'Descubrir', status: 'fail', detail: `feed.json no carga: ${error instanceof Error ? error.message : String(error)}` });
  }

  const online = options.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine);
  checks.push({
    id: 'network',
    label: 'Red',
    status: online ? 'pass' : 'warn',
    detail: online ? 'navigator.onLine = true' : 'offline: sólo cache local disponible',
  });

  const serviceWorkerControlled = options.serviceWorkerControlled ?? (
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? !!navigator.serviceWorker.controller
      : false
  );
  checks.push({
    id: 'service-worker',
    label: 'PWA cache',
    status: serviceWorkerControlled ? 'pass' : 'warn',
    detail: serviceWorkerControlled ? 'service worker controla esta pestaña' : 'sin controller (normal en primera carga / preview)',
  });

  return checks;
}
