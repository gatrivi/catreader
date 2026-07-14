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

export function sentencesFromPageHtml(pageHtml: string, selection?: string | null): string[] {
  const sentences = splitSentences(htmlToPlain(pageHtml));
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
