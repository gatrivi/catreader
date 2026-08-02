import type { LibraryBook } from '../hooks/useLibrary';
import { stainsForPage, type PaperManifest } from './paperSoul';
import type { ReadingFeedItem } from './readingFeed';

const SHARE_WIDTH = 1080;
const SHARE_HEIGHT = 1350;
const PAPER_BG = '#cbb892';
const PAPER_INK = '#2f2418';

export type FragmentShareCardInput = {
  item: ReadingFeedItem;
  book: Pick<LibraryBook, 'title' | 'author' | 'svg'>;
  manifest?: PaperManifest | null;
  paperPage?: number;
  coverSrc?: string | null;
  shareUrl?: string;
};

export type ClipboardCopyMode = 'image-and-text' | 'text';
export type ShareCardRenderer = (input: FragmentShareCardInput) => Promise<Blob>;

export function svgDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function resolveArtSource(source?: string | null): string | null {
  if (!source) return null;
  return source.includes('<svg') ? svgDataUrl(source) : source;
}

export function buildFragmentShareText(input: FragmentShareCardInput): string {
  const quote = input.item.text.replace(/\s+/g, ' ').trim();
  const title = input.book.title || input.item.title;
  const source = [title, input.book.author || input.item.author].filter(Boolean).join(' — ');
  return [quote ? '“' + quote + '”' : '', source, input.shareUrl || ''].filter(Boolean).join('\n\n');
}

function canvasSafeSource(source: string): string | null {
  if (source.startsWith('data:')) return source;
  try {
    const url = new URL(source, window.location.href);
    return url.origin === window.location.origin ? url.toString() : null;
  } catch {
    return null;
  }
}

function loadImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

async function loadOptionalImage(source?: string | null): Promise<HTMLImageElement | null> {
  if (!source) return null;
  return loadImage(source);
}

function drawImageContain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const sourceWidth = image.naturalWidth || image.width || width;
  const sourceHeight = image.naturalHeight || image.height || height;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  if (lines.length === maxLines && words.length > 0) {
    const last = lines[maxLines - 1] || '';
    lines[maxLines - 1] = last.length > 3 ? last.slice(0, -3) + '…' : last + '…';
  }

  lines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

export async function renderFragmentShareCard(input: FragmentShareCardInput): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('Canvas unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');

  context.fillStyle = PAPER_BG;
  context.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);

  const active = stainsForPage(input.manifest, input.paperPage || 1);
  const coverSource = canvasSafeSource(input.coverSrc || resolveArtSource(input.book.svg));
  const stainSources = active.map(({ stain }) => canvasSafeSource(stain.src));
  const [grain, cover, ...stains] = await Promise.all([
    loadOptionalImage('/paper/grain.svg'),
    loadOptionalImage(coverSource),
    ...stainSources.map((source) => loadOptionalImage(source)),
  ]);

  if (grain) {
    const pattern = context.createPattern(grain, 'repeat');
    if (pattern) {
      context.save();
      context.globalAlpha = 0.42;
      context.globalCompositeOperation = 'multiply';
      context.fillStyle = pattern;
      context.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
      context.restore();
    }
  }

  // Soft aged vignette — matches Discover card wash when stains are sparse.
  const wash = context.createRadialGradient(
    SHARE_WIDTH * 0.5, SHARE_HEIGHT * 0.45, SHARE_HEIGHT * 0.15,
    SHARE_WIDTH * 0.5, SHARE_HEIGHT * 0.5, SHARE_HEIGHT * 0.72
  );
  wash.addColorStop(0, 'rgba(55, 36, 18, 0)');
  wash.addColorStop(1, 'rgba(55, 36, 18, 0.28)');
  context.fillStyle = wash;
  context.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);

  context.save();
  context.globalCompositeOperation = 'multiply';
  active.forEach(({ stain, opacity }, index) => {
    const image = stains[index];
    if (!image) return;
    const size = Math.max(120, stain.r_px * 2 * (SHARE_WIDTH / 800));
    context.globalAlpha = opacity;
    context.drawImage(image, stain.x * SHARE_WIDTH - size / 2, stain.y * SHARE_HEIGHT - size / 2, size, size);
  });
  context.restore();

  const artX = 72;
  const artY = 78;
  const artWidth = 168;
  const artHeight = 250;
  if (cover) {
    context.save();
    context.shadowColor = 'rgba(68, 54, 40, 0.24)';
    context.shadowBlur = 22;
    context.shadowOffsetY = 10;
    drawImageContain(context, cover, artX, artY, artWidth, artHeight);
    context.restore();
  } else {
    context.fillStyle = '#8a6b46';
    context.fillRect(artX, artY, artWidth, artHeight);
    context.fillStyle = '#e8d5ae';
    context.font = 'bold 28px Georgia, serif';
    context.fillText('CAT', artX + 34, artY + 112);
    context.font = '18px Georgia, serif';
    context.fillText('READER', artX + 34, artY + 142);
  }

  const titleX = 286;
  context.fillStyle = '#7a5b3b';
  context.font = 'bold 19px Arial, sans-serif';
  context.fillText('CATREADER · DESCUBRIR', titleX, 100);
  context.fillStyle = PAPER_INK;
  context.font = 'bold 42px Georgia, serif';
  drawWrappedText(context, input.book.title || input.item.title, titleX, 158, SHARE_WIDTH - titleX - 72, 52, 4);
  context.fillStyle = '#765e49';
  context.font = '22px Arial, sans-serif';
  if (input.book.author || input.item.author) {
    context.fillText(input.book.author || input.item.author || '', titleX, 315);
  }

  context.strokeStyle = 'rgba(122, 91, 59, 0.32)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(72, 372);
  context.lineTo(SHARE_WIDTH - 72, 372);
  context.stroke();

  context.fillStyle = PAPER_INK;
  context.font = '48px Georgia, serif';
  drawWrappedText(context, '“' + input.item.text.replace(/\s+/g, ' ').trim() + '”', 72, 460, SHARE_WIDTH - 144, 68, 10);

  context.fillStyle = '#765e49';
  context.font = '18px Arial, sans-serif';
  context.fillText(input.shareUrl || 'catreader.gatrivi.com', 72, SHARE_HEIGHT - 72);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode share card'));
    }, 'image/png');
  });
}

export async function copyFragmentToClipboard(
  input: FragmentShareCardInput,
  renderCard: ShareCardRenderer = renderFragmentShareCard
): Promise<ClipboardCopyMode> {
  const text = buildFragmentShareText(input);
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  const clipboardItemConstructor = (globalThis as unknown as {
    ClipboardItem?: new (items: Record<string, Blob>) => unknown;
  }).ClipboardItem;
  let image: Blob | null = null;
  if (clipboard?.write && clipboardItemConstructor) {
    try {
      image = await renderCard(input);
    } catch {
      // Text-only fallback remains useful on browsers without canvas or image access.
    }
  }

  if (image && clipboard?.write && clipboardItemConstructor) {
    try {
      const item = new clipboardItemConstructor({
        'image/png': image,
        'text/plain': new Blob([text], { type: 'text/plain' }),
      });
      await clipboard.write([item as ClipboardItem]);
      return 'image-and-text';
    } catch {
      // Some mobile browsers expose write() but reject mixed clipboard types.
    }
  }

  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return 'text';
  }
  throw new Error('Clipboard unavailable');
}
