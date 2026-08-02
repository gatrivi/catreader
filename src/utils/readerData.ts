export type ReaderPayload = {
  version: number;
  type?: string;
  pages: string[];
};

/** Keep the browser path identical to scripts/generate-library.js. */
export function safeReaderId(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96);
}

export function readerAssetPath(filename: string, baseUrl = '/'): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}reader/${safeReaderId(filename)}.json`;
}

export function parseReaderPayload(value: unknown): string[] | null {
  if (!value || typeof value !== 'object') return null;
  const pages = (value as Partial<ReaderPayload>).pages;
  if (!Array.isArray(pages)) return null;
  const normalized = pages.filter((page): page is string => typeof page === 'string');
  return normalized.length && normalized.some((page) => page.trim()) ? normalized : null;
}

/** Supports old local ghost-text caches as well as the new page JSON assets. */
export function parseStoredReaderText(value: string | null): string[] | null {
  if (!value?.trim()) return null;

  if (value.trimStart().startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        const pages = parsed.filter((page): page is string => typeof page === 'string');
        if (pages.length && pages.some((page) => page.trim())) return pages;
      }
    } catch {
      // Fall through to the legacy [Page N] format.
    }
  }

  if (value.includes('[Page ')) {
    const pages = value.split(/\[Page \d+\]\n/).filter(Boolean);
    return pages.length && pages.some((page) => page.trim()) ? pages : null;
  }

  return [value];
}
