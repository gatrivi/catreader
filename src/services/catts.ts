/**
 * CATTS external TTS client (docs/EXTERNAL_TTS.md on catts box).
 * Default host = Tailscale CATTS; override with VITE_CATTS_URL.
 */

const DEFAULT_BASE = 'http://100.87.252.18:59200';

export function cattsBaseUrl(): string {
  return (import.meta.env.VITE_CATTS_URL as string | undefined)?.replace(/\/$/, '') || DEFAULT_BASE;
}

function apiKey(): string {
  return (import.meta.env.VITE_CATTS_API_KEY as string | undefined) || '';
}

function authHeaders(): HeadersInit {
  const key = apiKey();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) h['X-API-Key'] = key;
  return h;
}

export type CattsLang = 'es' | 'en';

/** Short live chunk (≤500 chars). Returns wav Blob. */
export async function cattsLive(text: string, lang: CattsLang = 'es'): Promise<Blob> {
  const res = await fetch(`${cattsBaseUrl()}/tts/live`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`CATTS live ${res.status}: ${detail.slice(0, 120)}`);
  }
  return res.blob();
}

/** Longer reading chunk. Returns wav Blob. */
export async function cattsSpeak(text: string, lang: CattsLang = 'es'): Promise<Blob> {
  const res = await fetch(`${cattsBaseUrl()}/tts/speak`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`CATTS speak ${res.status}: ${detail.slice(0, 120)}`);
  }
  return res.blob();
}

/* --- Audiobook library API (docs/CATREADER_TTS.md on catts box) --- */

/** Library API key. Defaults to shared 'catts-local'; override via VITE_CATTS_API_KEY. */
function libHeaders(): HeadersInit {
  return { 'X-API-Key': apiKey() || 'catts-local' };
}

export interface AudiobookChapter {
  /** 1-based index used in URLs; falls back to array position when absent */
  n?: number;
  title?: string;
  audio_url?: string;
  subtitles_url?: string;
  has_subtitles?: boolean;
  empty?: boolean;
}

export interface AudiobookListItem {
  id: string;
  title?: string;
  author?: string;
  status?: string;
  chapters?: number;
  chapters_ready?: number;
  ready?: boolean;
  has_subtitles?: boolean;
}

export interface AudiobookMeta extends AudiobookListItem {
  chapters_detail: AudiobookChapter[];
}

function normalizeChapter(ch: Record<string, unknown>, i: number): AudiobookChapter {
  const n = Number(ch.n ?? ch.index ?? i + 1);
  const sub = (ch.subtitles_url ?? ch.subtitle_url) as string | undefined;
  return {
    n,
    title: typeof ch.title === 'string' ? ch.title : `Chapter ${n}`,
    audio_url: typeof ch.audio_url === 'string' ? ch.audio_url : undefined,
    subtitles_url: sub,
    has_subtitles: Boolean(sub),
    empty: Boolean(ch.empty),
  };
}

/** GET /books → available audiobooks. */
export async function cattsAudiobooks(): Promise<AudiobookListItem[]> {
  const res = await fetch(`${cattsBaseUrl()}/books`, { headers: libHeaders() });
  if (!res.ok) throw new Error(`CATTS books ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.books ?? [];
}

/** GET /books/{id} → meta + chapters_detail. */
export async function cattsAudiobook(id: string): Promise<AudiobookMeta> {
  const res = await fetch(`${cattsBaseUrl()}/books/${encodeURIComponent(id)}`, { headers: libHeaders() });
  if (!res.ok) throw new Error(`CATTS book ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data.chapters_detail) ? data.chapters_detail : [];
  const chapters_detail = raw
    .map((ch: Record<string, unknown>, i: number) => normalizeChapter(ch, i))
    .filter((ch: AudiobookChapter) => !ch.empty);
  return { ...data, id: data.id || id, chapters_detail };
}

/** GET chapter audio (mpeg) as Blob. Auth header needed → fetch, not <audio src>. */
export async function cattsChapterAudio(id: string, n: number): Promise<Blob> {
  const res = await fetch(`${cattsBaseUrl()}/books/${encodeURIComponent(id)}/chapters/${n}/audio`, {
    headers: libHeaders(),
  });
  if (!res.ok) throw new Error(`CATTS chapter audio ${res.status}`);
  return res.blob();
}

/** GET chapter subtitles as raw SRT text. */
export async function cattsChapterSubtitles(id: string, n: number): Promise<string> {
  const res = await fetch(`${cattsBaseUrl()}/books/${encodeURIComponent(id)}/chapters/${n}/subtitles`, {
    headers: libHeaders(),
  });
  if (!res.ok) throw new Error(`CATTS chapter subtitles ${res.status}`);
  return res.text();
}
