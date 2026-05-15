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

export function parseBookPath(path: string): {
  shelfSlug: string;
  bookSlug: string;
  page?: number;
  quadrant?: number;
} | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [shelfSlug, bookSlug, pageStr, quadrantStr] = parts;
  const page = pageStr ? parseInt(pageStr, 10) : undefined;
  const quadrant = quadrantStr ? parseInt(quadrantStr, 10) : undefined;
  return { shelfSlug, bookSlug, page, quadrant };
}

export function matchBookBySlug(
  library: Array<{ filename: string }>,
  bookSlug: string
): { filename: string } | undefined {
  return library.find((b) => slugify(b.filename.replace(/\.[^/.]+$/, '')) === bookSlug);
}
