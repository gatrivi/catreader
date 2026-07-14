import { useCallback, useEffect, useRef, useState } from 'react';
import { cattsLive, type CattsLang } from '../services/catts';
import { coverDB } from '../services/db';
import { chunkForLive, hashText } from '../utils/sentences';

export type LiveAudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

type QueueItem = { text: string; blob?: Blob; url?: string };

/**
 * Sentence pipeline: fetch /tts/live (cache IDB), prefetch next while playing.
 * ponytail: single Audio element; prefetch depth 1.
 */
export function useLiveAudio(lang: CattsLang = 'es') {
  const [status, setStatus] = useState<LiveAudioStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);

  const queueRef = useRef<QueueItem[]>([]);
  const idxRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef(false);
  const prefetchingRef = useRef<Set<number>>(new Set());

  const cleanupUrls = useCallback(() => {
    for (const q of queueRef.current) {
      if (q.url) URL.revokeObjectURL(q.url);
      q.url = undefined;
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current = true;
    const a = audioRef.current;
    if (a) {
      a.onended = null;
      a.pause();
      a.removeAttribute('src');
    }
    cleanupUrls();
    queueRef.current = [];
    idxRef.current = 0;
    prefetchingRef.current.clear();
    setIndex(0);
    setTotal(0);
    setStatus('idle');
    setError(null);
  }, [cleanupUrls]);

  useEffect(() => () => stop(), [stop]);

  const ensureBlob = useCallback(
    async (i: number): Promise<Blob | null> => {
      const item = queueRef.current[i];
      if (!item) return null;
      if (item.blob) return item.blob;
      if (prefetchingRef.current.has(i)) {
        // wait for in-flight
        for (let n = 0; n < 120 && !queueRef.current[i]?.blob; n++) {
          await new Promise((r) => setTimeout(r, 100));
          if (abortRef.current) return null;
        }
        return queueRef.current[i]?.blob || null;
      }
      prefetchingRef.current.add(i);
      try {
        const key = `${lang}:${hashText(item.text)}`;
        let blob = await coverDB.getTtsAudio(key);
        if (!blob) {
          blob = await cattsLive(item.text, lang);
          await coverDB.saveTtsAudio(key, blob).catch(() => {});
        }
        if (queueRef.current[i]) queueRef.current[i].blob = blob;
        return blob;
      } finally {
        prefetchingRef.current.delete(i);
      }
    },
    [lang]
  );

  const playAt = useCallback(
    async (i: number) => {
      if (abortRef.current) return;
      const item = queueRef.current[i];
      if (!item) {
        setStatus('idle');
        return;
      }
      setIndex(i);
      idxRef.current = i;
      setStatus('loading');
      try {
        const blob = await ensureBlob(i);
        if (!blob || abortRef.current) return;
        // prefetch next
        if (i + 1 < queueRef.current.length) void ensureBlob(i + 1);

        if (!audioRef.current) audioRef.current = new Audio();
        const a = audioRef.current;
        if (item.url) URL.revokeObjectURL(item.url);
        item.url = URL.createObjectURL(blob);
        a.src = item.url;
        a.onended = () => {
          void playAt(i + 1);
        };
        setStatus('playing');
        await a.play();
      } catch (e: any) {
        if (abortRef.current) return;
        setError(e?.message || 'TTS failed');
        setStatus('error');
      }
    },
    [ensureBlob]
  );

  const start = useCallback(
    async (sentences: string[]) => {
      stop();
      abortRef.current = false;
      const chunks = sentences.flatMap((s) => chunkForLive(s));
      if (chunks.length === 0) {
        setError('Sin texto en esta página');
        setStatus('error');
        return;
      }
      queueRef.current = chunks.map((text) => ({ text }));
      setTotal(chunks.length);
      await playAt(0);
    },
    [playAt, stop]
  );

  const togglePause = useCallback(() => {
    const a = audioRef.current;
    if (!a || status === 'idle' || status === 'error') return;
    if (status === 'playing') {
      a.pause();
      setStatus('paused');
    } else if (status === 'paused') {
      void a.play();
      setStatus('playing');
    }
  }, [status]);

  return { status, error, index, total, start, stop, togglePause };
}
