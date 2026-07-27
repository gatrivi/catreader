/**
 * Pre-baked CatTS chapter player (blob fetch — auth header required).
 * ponytail: no subtitle sync yet; chapter list + play/pause/next.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CassetteTape, ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { cattsAudiobook, cattsChapterAudio, type AudiobookChapter } from '../services/catts';

type Props = {
  cattsBookId: string;
  title?: string;
  onClose: () => void;
};

export function AudiobookListenPanel({ cattsBookId, title, onClose }: Props) {
  const [chapters, setChapters] = useState<AudiobookChapter[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const revoke = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const meta = await cattsAudiobook(cattsBookId);
        if (!cancelled) setChapters(meta.chapters_detail || []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'No se pudo cargar el audiolibro');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
      revoke();
    };
  }, [cattsBookId]);

  const playChapter = useCallback(
    async (i: number) => {
      const ch = chapters[i];
      if (!ch?.n) return;
      setErr(null);
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
          if (i + 1 < chapters.length) void playChapter(i + 1);
          else setPlaying(false);
        };
        await a.play();
        setPlaying(true);
      } catch (e: any) {
        setErr(e?.message || 'Error de audio');
        setPlaying(false);
      }
    },
    [cattsBookId, chapters]
  );

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

  const ch = chapters[idx];

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-lg rounded-2xl border border-amber-500/30 bg-stone-950/95 backdrop-blur-md shadow-2xl text-stone-100">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <CassetteTape size={16} className="text-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-amber-500/80">Audiolibro CatTS</div>
            <div className="truncate text-sm font-medium">{title || cattsBookId}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {loading && <div className="px-4 pb-4 text-xs text-stone-400">Cargando capítulos…</div>}
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
                disabled={idx >= chapters.length - 1}
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
