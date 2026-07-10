/** Root path for the library view (respects Vite base URL). */
export function getLibraryPath(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildBookPath(
  shelfTitle: string,
  bookFilename: string,
  page?: number,
  quadrant?: number
): string {
  const shelfSlug = slugify(shelfTitle);
  const bookSlug = slugify(bookFilename.replace(/\.[^/.]+$/, ''));
  let path = `/${shelfSlug}/${bookSlug}`;
  if (page && page > 1) {
    path += `/${page}`;
    if (quadrant && quadrant > 1) {
      path += `/${quadrant}`;
    }
  }
  return path;
}

export type BookRoute = {
  shelfSlug: string;
  bookSlug: string;
  rawFilename?: string;
  page?: number;
  quadrant?: number;
};

export function parseBookPath(path: string): BookRoute | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [shelfSlug, bookSlug, pageStr, quadrantStr] = parts;
  const page = pageStr ? parseInt(pageStr, 10) : undefined;
  const quadrant = quadrantStr ? parseInt(quadrantStr, 10) : undefined;
  return { shelfSlug, bookSlug, page, quadrant };
}

export function matchBookBySlug(
  library: Array<{ filename: string }>,
  bookSlug: string,
  rawFilename?: string
): { filename: string } | undefined {
  if (rawFilename) {
    const decoded = decodeURIComponent(rawFilename);
    const exact = library.find(
      (b) =>
        b.filename === decoded ||
        b.filename.toLowerCase() === decoded.toLowerCase()
    );
    if (exact) return exact;
  }
  const normalized = bookSlug.toLowerCase();
  return library.find((b) => {
    if (b.filename.toLowerCase() === normalized) return true;
    return slugify(b.filename.replace(/\.[^/.]+$/, '')) === normalized;
  });
}

/** Legacy share links: ?book=filename.pdf&page=12 */
export function parseBookQuery(search: string): BookRoute | null {
  const params = new URLSearchParams(search);
  const book = params.get('book');
  if (!book) return null;
  const pageStr = params.get('page');
  const page = pageStr ? parseInt(pageStr, 10) : undefined;
  return {
    shelfSlug: 'library',
    bookSlug: slugify(book.replace(/\.[^/.]+$/, '')),
    rawFilename: book,
    page: page && !isNaN(page) ? page : undefined,
  };
}

function stripBasePath(pathname: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const basePath = base.endsWith('/') ? base.slice(0, -1) : base;
  if (basePath && basePath !== '/' && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || '/';
  }
  return pathname;
}

export function resolveBookRoute(pathname: string, search: string) {
  return parseBookPath(stripBasePath(pathname)) || parseBookQuery(search);
}

/** Absolute URL for sharing — opens the book directly when visited. */
export function buildBookShareUrl(
  shelfTitle: string,
  bookFilename: string,
  page?: number,
  quadrant?: number
): string {
  const base = getLibraryPath().replace(/\/$/, '');
  const path = buildBookPath(shelfTitle, bookFilename, page, quadrant);
  return `${window.location.origin}${base}${path}`;
}
