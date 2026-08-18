export type AutoCoverSource = 'google-books' | 'openlibrary';

export interface AutoCoverResult {
  url: string;
  source: AutoCoverSource;
}

export interface AutoCoverBook {
  filename: string;
  title: string;
  author?: string;
}

const STORAGE_KEY = 'catreader_auto_covers_v1';
const MAX_CONCURRENT_LOOKUPS = 4;
const UNKNOWN_AUTHORS = new Set(['', 'desconocido', 'autor desconocido', 'unknown', 'unknown author']);

let activeLookups = 0;
const queue: Array<() => void> = [];
const inflight = new Map<string, Promise<AutoCoverResult | null>>();
const badUrls = new Set<string>();

function runNext() {
  while (activeLookups < MAX_CONCURRENT_LOOKUPS && queue.length) {
    activeLookups += 1;
    const run = queue.shift()!;
    run();
  }
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => {
      void task()
        .then(resolve, reject)
        .finally(() => {
          activeLookups -= 1;
          runNext();
        });
    });
    runNext();
  });
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCoverLookupTitle(title: string, filename: string): string {
  const stem = filename.replace(/\.[^/.]+$/, '');
  const raw = title && title !== filename && title !== stem ? title : stem;
  return raw
    .replace(/[-_]+/g, ' ')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulAuthor(author?: string): string {
  const clean = normalizeText(author || '');
  return UNKNOWN_AUTHORS.has(clean) ? '' : (author || '').trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(' ')
      .filter((token) => token.length > 1 && !['the', 'a', 'an', 'de', 'del', 'la', 'el', 'los', 'las', 'of'].includes(token)),
  );
}

export function titleMatchScore(query: string, candidate: string): number {
  const wanted = tokens(query);
  const got = tokens(candidate);
  if (!wanted.size || !got.size) return 0;
  let matches = 0;
  wanted.forEach((token) => {
    if (got.has(token)) matches += 1;
  });
  return matches / wanted.size;
}

function authorLooksCompatible(author: string, candidates: string[] | undefined): boolean {
  if (!author || !candidates?.length) return true;
  const wanted = tokens(author);
  if (!wanted.size) return true;
  return candidates.some((candidate) => {
    const got = tokens(candidate);
    for (const token of wanted) {
      if (got.has(token)) return true;
    }
    return false;
  });
}

function googleBooksCover(id: string): string {
  return `https://books.google.com/books/content?id=${encodeURIComponent(id)}&printsec=frontcover&img=1&zoom=2&source=gbs_api`;
}

/** Known public-domain volumes where generic search can easily return the wrong part. */
export function knownCoverFor(book: AutoCoverBook): AutoCoverResult | null {
  const title = normalizeText(normalizeCoverLookupTitle(book.title, book.filename));
  const author = normalizeText(meaningfulAuthor(book.author));
  const isOsuna = title.includes('abecedario espiritual') && (!author || author.includes('osuna'));
  if (!isOsuna) return null;

  if (/\b(vol(?:umen)?\s*2|segund[oa])\b/.test(title)) {
    return { url: googleBooksCover('5TA8AAAAcAAJ'), source: 'google-books' };
  }
  if (/\b(vol(?:umen)?\s*1|primer[oa])\b/.test(title) || !/\bvol(?:umen)?\s*\d+\b/.test(title)) {
    return { url: googleBooksCover('1jA8AAAAcAAJ'), source: 'google-books' };
  }
  return null;
}

function readCache(): Record<string, AutoCoverResult> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCached(filename: string, result: AutoCoverResult) {
  if (typeof localStorage === 'undefined') return;
  try {
    const cache = readCache();
    cache[filename] = result;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage is an optimization only; a cover must still render without it.
  }
}

export function invalidateAutoCover(filename: string, url?: string) {
  if (url) badUrls.add(url);
  if (typeof localStorage === 'undefined') return;
  try {
    const cache = readCache();
    if (!cache[filename]) return;
    if (url && cache[filename].url !== url) return;
    delete cache[filename];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Best effort.
  }
}

async function lookupGoogleBooks(book: AutoCoverBook): Promise<AutoCoverResult | null> {
  const title = normalizeCoverLookupTitle(book.title, book.filename);
  const author = meaningfulAuthor(book.author);
  if (!title) return null;

  const q = `intitle:${title}${author ? ` inauthor:${author}` : ''}`;
  const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books`);
  if (!response.ok) return null;
  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : [];

  const ranked = items
    .map((item: any) => {
      const info = item?.volumeInfo || {};
      const image = info.imageLinks?.medium || info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
      return {
        score: titleMatchScore(title, info.title || ''),
        authorOk: authorLooksCompatible(author, info.authors),
        image: typeof image === 'string' ? image.replace(/^http:/, 'https:') : '',
      };
    })
    .filter((item: any) => item.image && item.authorOk && item.score >= 0.5 && !badUrls.has(item.image))
    .sort((a: any, b: any) => b.score - a.score);

  return ranked[0]?.image ? { url: ranked[0].image, source: 'google-books' } : null;
}

async function lookupOpenLibrary(book: AutoCoverBook): Promise<AutoCoverResult | null> {
  const title = normalizeCoverLookupTitle(book.title, book.filename);
  const author = meaningfulAuthor(book.author);
  if (!title) return null;

  const params = new URLSearchParams({ title, limit: '5' });
  if (author) params.set('author', author);
  const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
  if (!response.ok) return null;
  const data = await response.json();
  const docs = Array.isArray(data.docs) ? data.docs : [];

  const ranked = docs
    .map((doc: any) => ({
      score: titleMatchScore(title, doc?.title || ''),
      authorOk: authorLooksCompatible(author, doc?.author_name),
      coverId: doc?.cover_i,
    }))
    .filter((item: any) => item.coverId && item.authorOk && item.score >= 0.5)
    .sort((a: any, b: any) => b.score - a.score);

  if (!ranked[0]?.coverId) return null;
  const url = `https://covers.openlibrary.org/b/id/${ranked[0].coverId}-L.jpg`;
  return badUrls.has(url) ? null : { url, source: 'openlibrary' };
}

async function resolveNetwork(book: AutoCoverBook): Promise<AutoCoverResult | null> {
  const known = knownCoverFor(book);
  if (known && !badUrls.has(known.url)) return known;

  try {
    const google = await lookupGoogleBooks(book);
    if (google) return google;
  } catch {
    // Continue to Open Library.
  }

  try {
    return await lookupOpenLibrary(book);
  } catch {
    return null;
  }
}

/**
 * Resolve a real cover quickly without blocking the shelf. Calls are globally
 * capped so a 4x4 mobile rack does not stampede Google Books/Open Library.
 */
export function resolveAutoCover(book: AutoCoverBook): Promise<AutoCoverResult | null> {
  const cached = readCache()[book.filename];
  if (cached?.url && !badUrls.has(cached.url)) return Promise.resolve(cached);

  const existing = inflight.get(book.filename);
  if (existing) return existing;

  const promise = schedule(() => resolveNetwork(book))
    .then((result) => {
      if (result) saveCached(book.filename, result);
      return result;
    })
    .finally(() => inflight.delete(book.filename));

  inflight.set(book.filename, promise);
  return promise;
}
