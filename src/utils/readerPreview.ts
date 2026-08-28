export interface ReaderPreview {
  version: 1;
  page: number;
  html: string;
  scrollRatio: number;
  updatedAt: number;
}

const PREVIEW_KEY_PREFIX = 'catreader_reader_preview_v1_';
const PREVIEW_MAX_CHARS = 7000;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function previewPlainText(source: string): string {
  return decodeBasicEntities(
    source
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<\/div\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function makeReaderPreviewHtml(source: string, centerRatio = 0): string {
  const plain = previewPlainText(source);
  if (!plain) return '';

  const ratio = clamp01(centerRatio);
  let chunk = plain;

  if (plain.length > PREVIEW_MAX_CHARS) {
    const center = Math.floor(plain.length * ratio);
    const idealStart = center - Math.floor(PREVIEW_MAX_CHARS * 0.28);
    const start = Math.max(0, Math.min(plain.length - PREVIEW_MAX_CHARS, idealStart));
    chunk = plain.slice(start, start + PREVIEW_MAX_CHARS);

    if (start > 0) {
      const firstBoundary = chunk.search(/[\s.!?]\S/);
      if (firstBoundary > 0 && firstBoundary < 180) chunk = chunk.slice(firstBoundary + 1);
    }
    if (start + PREVIEW_MAX_CHARS < plain.length) {
      const lastBoundary = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('? '), chunk.lastIndexOf('! '));
      if (lastBoundary > chunk.length * 0.72) chunk = chunk.slice(0, lastBoundary + 1);
    }
  }

  const paragraphs = chunk
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return `<p>${escapeHtml(chunk)}</p>`;
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`).join('');
}

export function loadReaderPreview(filename: string): ReaderPreview | null {
  if (typeof localStorage === 'undefined' || !filename) return null;
  try {
    const raw = localStorage.getItem(`${PREVIEW_KEY_PREFIX}${filename}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReaderPreview>;
    if (parsed.version !== 1 || typeof parsed.html !== 'string' || !parsed.html.trim()) return null;
    return {
      version: 1,
      page: Math.max(1, Number(parsed.page) || 1),
      html: parsed.html,
      scrollRatio: clamp01(Number(parsed.scrollRatio) || 0),
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function saveReaderPreview(
  filename: string,
  page: number,
  source: string,
  scrollRatio = 0
): ReaderPreview | null {
  if (typeof localStorage === 'undefined' || !filename || !source?.trim()) return null;
  const html = makeReaderPreviewHtml(source, scrollRatio);
  if (!html) return null;

  const preview: ReaderPreview = {
    version: 1,
    page: Math.max(1, Number(page) || 1),
    html,
    scrollRatio: clamp01(scrollRatio),
    updatedAt: Date.now(),
  };

  try {
    localStorage.setItem(`${PREVIEW_KEY_PREFIX}${filename}`, JSON.stringify(preview));
    return preview;
  } catch {
    return null;
  }
}
