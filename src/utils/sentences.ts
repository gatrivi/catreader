/** Plain text + sentence split for live TTS. */

const LIVE_MAX_CHARS = 500;
/** CATTS /tts/live: melotts/kokoro/… cap ~80 words. */
const LIVE_MAX_WORDS = 80;

/** Strip HTML / collapse whitespace. */
export function htmlToPlain(html: string): string {
  if (!html) return '';
  const tmp = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (tmp) {
    tmp.innerHTML = html;
    return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  }
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split on . ! ? … plus Spanish ¿¡ closers; keep non-empty. */
export function splitSentences(text: string): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const parts = t.split(/(?<=[.!?…])\s+|(?<=[.!?…]")\s+/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Index of sentence that contains/starts with selection; 0 if none. */
export function startIndexFromSelection(sentences: string[], selection: string): number {
  const sel = selection.replace(/\s+/g, ' ').trim();
  if (!sel || sentences.length === 0) return 0;
  const needle = sel.slice(0, 80).toLowerCase();
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].toLowerCase();
    if (s.includes(needle) || needle.includes(s.slice(0, 40))) return i;
  }
  // fuzzy: first sentence overlapping any 24-char window of selection
  if (sel.length >= 24) {
    const window = sel.slice(0, 24).toLowerCase();
    const idx = sentences.findIndex((s) => s.toLowerCase().includes(window));
    if (idx >= 0) return idx;
  }
  return 0;
}

/** Cap for POST /tts/live (≤500 chars / ≤80 words). Prefer clause breaks. */
export function chunkForLive(
  sentence: string,
  maxChars = LIVE_MAX_CHARS,
  maxWords = LIVE_MAX_WORDS
): string[] {
  const s = sentence.trim();
  if (!s) return [];
  const words = s.split(/\s+/);
  if (s.length <= maxChars && words.length <= maxWords) return [s];
  const out: string[] = [];
  let buf: string[] = [];
  let chars = 0;
  const flush = () => {
    if (buf.length) {
      out.push(buf.join(' '));
      buf = [];
      chars = 0;
    }
  };
  for (const w of words) {
    const next = chars + (buf.length ? 1 : 0) + w.length;
    if (buf.length >= maxWords || next > maxChars) flush();
    buf.push(w);
    chars += (buf.length > 1 ? 1 : 0) + w.length;
  }
  flush();
  return out.filter(Boolean);
}

/** Escape for RegExp. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Drop repeating PDF chrome: book title / author / "by Author" at page start.
 * pdfParser header-band filter misses Title Case running heads — TTS must strip too.
 */
export function stripRunningHeaders(
  plain: string,
  opts?: { title?: string; author?: string }
): string {
  let t = (plain || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;

  const title = (opts?.title || '').replace(/\s+/g, ' ').trim();
  const author = (opts?.author || '').replace(/\s+/g, ' ').trim();

  const needles: string[] = [];
  if (title.length >= 8) {
    needles.push(title);
    if (title.length > 24) needles.push(title.slice(0, 24));
    if (title.length > 36) needles.push(title.slice(0, 36));
  }
  if (author.length >= 4) {
    needles.push(`by ${author}`);
    needles.push(author);
  }

  // Truncated running heads: "The Conferences of John Ca..." (ellipsis / cut mid-word)
  if (title.length >= 16) {
    const head = esc(title.slice(0, 20));
    t = t.replace(new RegExp(`^${head}[\\w'’.-]*[.…]*(?:\\s+|$)`, 'i'), '').trim();
  }

  for (let n = 0; n < 4; n++) {
    let hit = false;
    for (const needle of needles) {
      if (!needle) continue;
      const re = new RegExp(`^${esc(needle)}[.…]*(?:\\s+|$)`, 'i');
      if (re.test(t)) {
        t = t.replace(re, '').trim();
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }

  if (author) {
    t = t.replace(new RegExp(`^by\\s+${esc(author)}[.…]*(?:\\s+|$)`, 'i'), '').trim();
  }

  return t;
}

export function sentencesFromPageHtml(
  pageHtml: string,
  selection?: string | null,
  opts?: { title?: string; author?: string }
): string[] {
  const sentences = splitSentences(stripRunningHeaders(htmlToPlain(pageHtml), opts));
  if (!selection?.trim()) return sentences;
  const start = startIndexFromSelection(sentences, selection);
  return sentences.slice(start);
}

export function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
