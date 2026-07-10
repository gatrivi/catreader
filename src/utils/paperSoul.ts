/** Paper Soul — stain opacity math + ink class helpers. */

export interface PaperStain {
  id: string;
  page_center: number;
  radius_pages: number;
  x: number; // 0–1
  y: number; // 0–1
  r_px: number;
  intensity: number;
  src: string;
}

export interface PaperManifest {
  seed: string;
  bookId: string;
  paletteTint: string;
  stains: PaperStain[];
}

export interface ActiveStain {
  stain: PaperStain;
  opacity: number;
}

/** Gaussian falloff across page depth (plan formula). */
export function stainOpacity(
  page: number,
  pageCenter: number,
  radiusPages: number,
  intensity: number
): number {
  if (radiusPages <= 0) return page === pageCenter ? intensity : 0;
  const d = page - pageCenter;
  return intensity * Math.exp(-(d * d) / (2 * radiusPages * radiusPages));
}

const OPACITY_FLOOR = 0.02;

export function stainsForPage(manifest: PaperManifest | null | undefined, page: number): ActiveStain[] {
  if (!manifest?.stains?.length) return [];
  return manifest.stains
    .map((stain) => ({
      stain,
      opacity: stainOpacity(page, stain.page_center, stain.radius_pages, stain.intensity),
    }))
    .filter((s) => s.opacity >= OPACITY_FLOOR)
    .sort((a, b) => b.opacity - a.opacity)
    .slice(0, 3);
}

/** Deterministic ink class 0–7 for EPUB/TXT char jitter. */
export function inkClass(charCode: number, index: number): number {
  return (charCode * 31 + index * 17) & 7;
}

export function wrapInkVariance(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      out += ch;
      continue;
    }
    out += `<span class="ink-${inkClass(ch.charCodeAt(0), i)}">${escapeHtml(ch)}</span>`;
  }
  return out;
}

/** Word-level ink for HTML ghost text (ponytail: avoids per-char span explosion). */
export function wrapInkVarianceHtml(html: string): string {
  let i = 0;
  return html.replace(/(^|>)([^<]+)(?=<|$)/g, (_m, open: string, text: string) => {
    if (!/\S/.test(text)) return open + text;
    const wrapped = text.replace(/\S+/g, (word) => {
      const cls = inkClass(word.charCodeAt(0), i++);
      return `<span class="ink-${cls}">${word}</span>`;
    });
    return open + wrapped;
  });
}

/** Plain → char wrap; HTML → word wrap. */
export function applyInkVariance(content: string): string {
  if (!content) return content;
  return content.includes('<') ? wrapInkVarianceHtml(content) : wrapInkVariance(content);
}

function escapeHtml(ch: string): string {
  if (ch === '&') return '&amp;';
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  return ch;
}

/** Folder-safe id for public/books/paper/<id>/ */
export function paperSafeId(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96);
}
