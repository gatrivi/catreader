import { debugInfo, debugWarn } from './debugLog';

/**
 * One full download beats range-chunking for 30–40MB books — see
 * docs/PDF_OPEN_PERFORMANCE.md. No flags: pdf.js streams from local blobs.
 */
export const PDF_LOAD_OPTIONS = {};

export function bookAssetUrl(filename: string, base = import.meta.env.BASE_URL || '/'): string {
  // Keep commas literal for static hosts, but escape URL delimiters in filenames.
  return base.replace(/\/$/, '') + '/books/' + encodeURIComponent(filename).replace(/%2C/gi, ',');
}

async function readBodyWithProgress(
  response: Response,
  onProgress?: (received: number, total: number) => void
): Promise<Blob> {
  const total = Number(response.headers.get('Content-Length')) || 0;
  if (!response.body || typeof response.body.getReader !== 'function') {
    return response.blob();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received, total);
  }
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

async function isPdfBlob(blob: Blob | null | undefined): Promise<boolean> {
  return !!blob?.size && (await blob.slice(0, 5).text()) === '%PDF-';
}

export interface PdfSourceOptions {
  writeCache?: (filename: string, blob: Blob) => Promise<unknown>;
  onProgress?: (received: number, total: number) => void;
}

/**
 * Resolve a readable source URL for a PDF. Cache hit → instant blob URL.
 * Cache miss → ONE streaming download (with progress), validated, cached to
 * IndexedDB, then served as a blob URL so both text and canvas modes share it.
 * Falls back to the network URL only if the download itself fails.
 */
export async function pdfSource(
  filename: string,
  readCache: (filename: string) => Promise<Blob | null>,
  options?: PdfSourceOptions
): Promise<string> {
  try {
    const cached = await readCache(filename);
    if (await isPdfBlob(cached)) {
      debugInfo('book-cache', 'hit', { filename, size: cached?.size });
      return URL.createObjectURL(cached as Blob);
    }
  } catch { /* Cache failure must not prevent a network read. */ }

  const url = bookAssetUrl(filename);
  try {
    debugInfo('book-fetch', 'request', { filename, url });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const blob = await readBodyWithProgress(response, options?.onProgress);
    if (!(await isPdfBlob(blob))) {
      throw new Error(`Invalid PDF response (${blob.type || 'unknown type'}, ${blob.size} bytes)`);
    }
    options?.writeCache?.(filename, blob).catch(() => {});
    debugInfo('book-fetch', 'success', { filename, size: blob.size });
    return URL.createObjectURL(blob);
  } catch (err) {
    debugWarn('book-fetch', 'download failed, falling back to network URL', {
      filename,
      error: err instanceof Error ? err.message : String(err),
    });
    return url;
  }
}
