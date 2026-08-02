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

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hex seed from book id (Discover fallback when bake missing). */
export function paperSeedFromId(bookId: string): string {
  let h = 2166136261;
  for (let i = 0; i < bookId.length; i++) {
    h ^= bookId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let out = '';
  for (let i = 0; i < 8; i++) {
    let n = h ^ (i * 0x9e3779b9);
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
    out += (n >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

/** Same SVG recipe as scripts/paper-bake.js — data URI so no on-disk bake required. */
export function proceduralStainDataUri(seedChunk: string, intensity: number): string {
  const n = parseInt(seedChunk.slice(0, 8), 16) || 1;
  const hue = 25 + (n % 20);
  const sat = 30 + (n % 25);
  const light = 35 + (n % 20);
  const c = `hsl(${hue} ${sat}% ${light}%)`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<defs><radialGradient id="g" cx="45%" cy="40%" r="55%">` +
    `<stop offset="0%" stop-color="${c}" stop-opacity="${Math.min(0.85, intensity + 0.3)}"/>` +
    `<stop offset="55%" stop-color="${c}" stop-opacity="${intensity * 0.45}"/>` +
    `<stop offset="100%" stop-color="${c}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<filter id="w"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="${n % 9999}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="18"/></filter></defs>` +
    `<circle cx="128" cy="128" r="110" fill="url(#g)" filter="url(#w)"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * Runtime Paper Soul stand-in for books without a baked manifest.
 * Deterministic per bookId so Discover cards stay stable across remounts.
 */
export function buildProceduralManifest(bookId: string, estimatedPages = 40): PaperManifest {
  const seed = paperSeedFromId(bookId || 'unknown');
  const rng = mulberry32(parseInt(seed.slice(0, 8), 16) || 1);
  const pages = Math.max(1, estimatedPages);
  const k = 5 + Math.floor(rng() * 11);
  const stains: PaperStain[] = [];
  for (let i = 0; i < k; i++) {
    const stainSeed = seed.slice(i * 2, i * 2 + 8) || seed.slice(0, 8);
    const intensity = 0.18 + rng() * 0.38;
    stains.push({
      id: `p${i}`,
      page_center: 1 + Math.floor(rng() * pages),
      radius_pages: 2 + rng() * 5,
      x: 0.12 + rng() * 0.76,
      y: 0.12 + rng() * 0.76,
      r_px: 70 + Math.floor(rng() * 110),
      intensity,
      src: proceduralStainDataUri(stainSeed + String(i), intensity),
    });
  }
  return {
    seed,
    bookId,
    paletteTint: '#f4ead5',
    stains,
  };
}

/** Prefer baked manifest; otherwise procedural stand-in. */
export function resolveFeedManifest(
  baked: PaperManifest | null | undefined,
  bookId: string
): PaperManifest {
  return baked?.stains?.length ? baked : buildProceduralManifest(bookId);
}
