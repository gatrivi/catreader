/** Range loading avoids downloading an entire PDF before the first page. */
export const PDF_LOAD_OPTIONS = { disableStream: true, disableAutoFetch: true };

export function bookAssetUrl(filename: string, base = import.meta.env.BASE_URL || '/'): string {
  // Keep commas literal for static hosts, but escape URL delimiters in filenames.
  return base.replace(/\/$/, '') + '/books/' + encodeURIComponent(filename).replace(/%2C/gi, ',');
}

export async function pdfSource(
  filename: string,
  readCache: (filename: string) => Promise<Blob | null>,
): Promise<string> {
  try {
    const cached = await readCache(filename);
    if (cached?.size && (await cached.slice(0, 5).text()) === '%PDF-') {
      return URL.createObjectURL(cached);
    }
  } catch { /* Cache failure must not prevent a network read. */ }
  return bookAssetUrl(filename);
}
