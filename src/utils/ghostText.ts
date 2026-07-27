/** Truly progressive ghost text — word → snippet → page → neighbors. docs/READER_MODE_LAZY.md */

export const GHOST_PREFETCH = 1;

export const GHOST_DRAFT_CLASS = 'ghost-draft';

/** 1-based page numbers around center (inclusive). window=0 → only center. */
export function pagesNeededAround(
  centerPage: number,
  totalPages: number,
  window: number = 0
): number[] {
  if (totalPages <= 0) return [];
  const c = Math.min(Math.max(1, centerPage || 1), totalPages);
  const lo = Math.max(1, c - window);
  const hi = Math.min(totalPages, c + window);
  const out: number[] = [];
  for (let p = lo; p <= hi; p++) out.push(p);
  return out;
}

export function isGhostDraft(html: string | null | undefined): boolean {
  return !!html && html.includes(GHOST_DRAFT_CLASS);
}

export function isGhostComplete(html: string | null | undefined): boolean {
  return !!html?.trim() && !isGhostDraft(html);
}

/** Empty / missing — nothing on screen yet. */
export function missingGhostPages(pages: (string | null | undefined)[], needed: number[]): number[] {
  return needed.filter((p) => {
    const html = pages[p - 1];
    return !html || !String(html).trim();
  });
}

/** Draft or empty — still needs full semantic parse. */
export function incompleteGhostPages(pages: (string | null | undefined)[], needed: number[]): number[] {
  return needed.filter((p) => !isGhostComplete(pages[p - 1]));
}

export function emptyGhostPages(totalPages: number): string[] {
  return Array.from({ length: Math.max(0, totalPages) }, () => '');
}

export function applyGhostPages(
  pages: string[],
  extracted: Record<number, string>
): string[] {
  const next = [...pages];
  for (const [pStr, html] of Object.entries(extracted)) {
    const p = Number(pStr);
    if (p >= 1 && p <= next.length) next[p - 1] = html;
  }
  return next;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Flatten pdf.js text items in order (best-effort). */
export function joinTextItems(tc: { items?: Array<{ str?: string }> } | null | undefined): string {
  if (!tc?.items?.length) return '';
  let out = '';
  for (const item of tc.items) {
    const s = item.str;
    if (!s) continue;
    // pdf.js often splits words; space when needed
    if (out && !/\s$/.test(out) && !/^\s/.test(s) && !/^[,.;:!?]/.test(s)) out += ' ';
    out += s;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Stage 1: first word — paint ASAP. */
export function firstWordHtml(tc: { items?: Array<{ str?: string }> }): string {
  const plain = joinTextItems(tc);
  if (!plain) return '';
  const word = plain.split(/\s+/).find(Boolean) || plain.slice(0, 1);
  return `<p class="${GHOST_DRAFT_CLASS} ghost-word">${escapeHtml(word)}</p>`;
}

/** Stage 2: short snippet (~sentence worth). */
export function snippetHtml(
  tc: { items?: Array<{ str?: string }> },
  maxChars = 180
): string {
  const plain = joinTextItems(tc);
  if (!plain) return '';
  const cut = plain.length > maxChars ? `${plain.slice(0, maxChars).trim()}…` : plain;
  return `<p class="${GHOST_DRAFT_CLASS} ghost-snippet">${escapeHtml(cut)}</p>`;
}

export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}
