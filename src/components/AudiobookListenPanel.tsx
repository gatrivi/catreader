/**
 * Pre-baked CatTS chapter player (blob fetch — auth header required).
 * Polls /books/{id} so progressive Pocket/Edge bakes appear while listening.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CassetteTape, ChevronLeft, ChevronRight, Download, Pause, Play, X } from 'lucide-react';
import {
  cattsAudiobook,
  cattsAudiobookDownload,
  cattsChapterAudio,
  saveBlobAsFile,
  type AudiobookChapter,
} from '../services/catts';

type Props = {
  cattsBookId: string;
  title?: string;
  onClose: () => void;
};

const POLL_MS = 20_000;

export function AudiobookListenPanel({ cattsBookId, title, onClose }: Props) {
  const [chapters, setChapters] = useState<AudiobookChapter[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [waitingNext, setWaitingNext] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const chaptersRef = useRef<AudiobookChapter[]>([]);
  const idxRef = useRef(0);
  const playingRef = useRef(false);
  const playChapterRef = useRef<(i: number) => Promise<void>>(async () => {});

  chaptersRef.current = chapters;
  idxRef.current = idx;
  playingRef.current = playing;

  const revoke = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  const refreshChapters = useCallback(async (quiet = false) => {
    try {
      const meta = await cattsAudiobook(cattsBookId);
      const next = meta.chapters_detail || [];
      setChapters(next);
      if (!quiet) setErr(null);
      return next;
    } catch (e: any) {
      if (!quiet) setErr(e?.message || 'No se pudo cargar el audiolibro');
      return null;
    }
  }, [cattsBookId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refreshChapters(false);
      if (!cancelled) setLoading(false);
    })();
    const t = window.setInterval(() => {
      void refreshChapters(true).then((next) => {
        if (!next) return;
        // if ended last known chapter and a new one appeared, keep going
        if (
          waitingNext ||
          (playingRef.current === false &&
            idxRef.current >= chaptersRef.current.length - 1 &&
            next.length > chaptersRef.current.length)
        ) {
          const i = idxRef.current + 1;
          if (i < next.length) {
            setWaitingNext(false);
            void playChapterRef.current(i);
          }
        }
      });
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      audioRef.current?.pause();
      revoke();
    };
  }, [cattsBookId, refreshChapters, waitingNext]);

  const playChapter = useCallback(
    async (i: number) => {
      const list = chaptersRef.current;
      const ch = list[i];
      if (!ch?.n) return;
      setErr(null);
      setWaitingNext(false);
      setIdx(i);
      try {
        const blob = await cattsChapterAudio(cattsBookId, ch.n);
        revoke();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        if (!audioRef.current) audioRef.current = new Audio();
        const a = audioRef.current;
        a.src = url;
        a.onended = () => {
          const cur = chaptersRef.current;
          if (i + 1 < cur.length) {
            void playChapterRef.current(i + 1);
          } else {
            setPlaying(false);
            setWaitingNext(true); // bake may still be writing next track
          }
        };
        await a.play();
        setPlaying(true);
      } catch (e: any) {
        setErr(e?.message || 'Error de audio');
        setPlaying(false);
      }
    },
    [cattsBookId]
  );
  playChapterRef.current = playChapter;

  const toggle = () => {
    const a = audioRef.current;
    if (playing && a && !a.paused) {
      a.pause();
      setPlaying(false);
      return;
    }
    if (a && a.src && a.paused && urlRef.current) {
      void a.play().then(() => setPlaying(true));
      return;
    }
    void playChapter(idx);
  };

  const downloadZip = async () => {
    setDlBusy(true);
    setErr(null);
    try {
      const blob = await cattsAudiobookDownload(cattsBookId);
      saveBlobAsFile(blob, `${cattsBookId}.zip`);
    } catch (e: any) {
      setErr(e?.message || 'Error al descargar');
    } finally {
      setDlBusy(false);
    }
  };

  const ch = chapters[idx];

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-lg rounded-2xl border border-amber-500/30 bg-stone-950/95 backdrop-blur-md shadow-2xl text-stone-100">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <CassetteTape size={16} className="text-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-amber-500/80">Audiolibro CatTS · Pocket</div>
            <div className="truncate text-sm font-medium">{title || cattsBookId}</div>
          </div>
          <button
            type="button"
            onClick={() => void downloadZip()}
            disabled={dlBusy || loading || chapters.length === 0}
            className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 disabled:opacity-30"
            aria-label="Descargar zip"
            title="Descargar mp3 (zip)"
          >
            <Download size={16} className={dlBusy ? 'animate-pulse' : ''} />
          </button>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {loading && <div className="px-4 pb-4 text-xs text-stone-400">Cargando capítulos…</div>}
        {!loading && chapters.length === 0 && (
          <div className="px-4 pb-4 text-xs text-amber-200/80">Bake en curso — aún no hay tracks. Reintenta en ~1 min.</div>
        )}
        {waitingNext && (
          <div className="px-4 pb-2 text-xs text-amber-400/90">Esperando siguiente capítulo (poll 20s)…</div>
        )}
        {err && <div className="px-4 pb-3 text-xs text-rose-400">{err}</div>}

        {!loading && chapters.length > 0 && (
          <>
            <div className="px-4 pb-2 text-xs text-stone-300 truncate">
              {idx + 1}/{chapters.length} · {ch?.title}
            </div>
            <div className="flex items-center justify-center gap-4 px-4 pb-3">
              <button
                type="button"
                disabled={idx <= 0}
                onClick={() => void playChapter(idx - 1)}
                className="p-2 rounded-full bg-stone-800 disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={toggle} className="p-3 rounded-full bg-amber-500 text-stone-950">
                {playing ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button
                type="button"
                disabled={idx >= chapters.length - 1 && !waitingNext}
                onClick={() => void playChapter(idx + 1)}
                className="p-2 rounded-full bg-stone-800 disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="max-h-36 overflow-y-auto border-t border-stone-800 px-2 py-2">
              {chapters.map((c, i) => (
                <button
                  key={c.n}
                  type="button"
                  onClick={() => void playChapter(i)}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded-lg truncate ${
                    i === idx ? 'bg-amber-500/15 text-amber-200' : 'text-stone-400 hover:bg-stone-800'
                  }`}
                >
                  {String(c.n).padStart(2, '0')}. {c.title}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
