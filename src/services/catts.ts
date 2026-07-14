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
