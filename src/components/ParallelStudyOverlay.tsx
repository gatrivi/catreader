import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Languages, Repeat2, Volume2, X } from 'lucide-react';

type ParallelAudio = {
  source?: string;
  target?: string;
};

type ParallelSegment = {
  id?: string | number;
  source: string;
  target: string;
  audio?: ParallelAudio;
};

type ParallelBook = {
  version?: number;
  sourceLanguage: string;
  targetLanguage: string;
  sourceTitle?: string;
  targetTitle?: string;
  generatedBy?: string;
  segments: ParallelSegment[];
};

const INITIAL_SEGMENTS = 120;
const SEGMENT_STEP = 120;

function siblingParallelUrl(filename: string): string | null {
  if (!/\.txt$/i.test(filename)) return null;
  const stem = filename.replace(/\.txt$/i, '');
  return `/books/${encodeURIComponent(stem)}.parallel.json`;
}

function shortLang(lang: string) {
  return lang.split('-')[0]?.toUpperCase() || lang.toUpperCase();
}

function currentReaderFilename(): string {
  const state = window.history.state;
  if (state?.view === 'reader' && typeof state.filename === 'string') return state.filename;
  return '';
}

export const ParallelStudyOverlay: React.FC = () => {
  const [filename, setFilename] = useState('');
  const [parallel, setParallel] = useState<ParallelBook | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_SEGMENTS);
  const [rate, setRate] = useState(0.88);
  const [repeatCount, setRepeatCount] = useState(1);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const loadTokenRef = useRef(0);

  useEffect(() => {
    const sync = () => {
      const next = currentReaderFilename();
      setFilename((previous) => (previous === next ? previous : next));
    };
    sync();
    window.addEventListener('popstate', sync);
    const timer = window.setInterval(sync, 600);
    return () => {
      window.removeEventListener('popstate', sync);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const url = siblingParallelUrl(filename);
    const token = ++loadTokenRef.current;
    setParallel(null);
    setIsOpen(false);
    setVisibleCount(INITIAL_SEGMENTS);
    if (!url) return;

    void fetch(url, { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as ParallelBook;
        if (!Array.isArray(data.segments) || data.segments.length === 0) return null;
        return data;
      })
      .then((data) => {
        if (token === loadTokenRef.current) setParallel(data);
      })
      .catch(() => {
        if (token === loadTokenRef.current) setParallel(null);
      });
  }, [filename]);

  const stopAudio = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    setActiveKey(null);
  }, []);

  useEffect(() => stopAudio, [stopAudio]);

  const speak = useCallback(
    (text: string, lang: string, repetitions: number, key: string) => {
      stopAudio();
      if (!text.trim() || !('speechSynthesis' in window)) return;
      setActiveKey(key);

      const run = (remaining: number) => {
        if (remaining <= 0) {
          setActiveKey(null);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = rate;
        const languagePrefix = lang.toLowerCase().split('-')[0];
        const voices = window.speechSynthesis.getVoices();
        const voice =
          voices.find((candidate) => candidate.lang.toLowerCase() === lang.toLowerCase()) ||
          voices.find((candidate) => candidate.lang.toLowerCase().startsWith(languagePrefix));
        if (voice) utterance.voice = voice;
        utterance.onend = () => run(remaining - 1);
        utterance.onerror = () => setActiveKey(null);
        window.speechSynthesis.speak(utterance);
      };

      run(repetitions);
    },
    [rate, stopAudio]
  );

  const playCached = useCallback(
    (url: string, repetitions: number, key: string) => {
      stopAudio();
      setActiveKey(key);
      const run = (remaining: number) => {
        if (remaining <= 0) {
          activeAudioRef.current = null;
          setActiveKey(null);
          return;
        }
        const audio = new Audio(url);
        activeAudioRef.current = audio;
        audio.playbackRate = rate;
        audio.onended = () => run(remaining - 1);
        audio.onerror = () => {
          activeAudioRef.current = null;
          setActiveKey(null);
        };
        void audio.play();
      };
      run(repetitions);
    },
    [rate, stopAudio]
  );

  const playSegment = useCallback(
    (segment: ParallelSegment, side: 'source' | 'target', index: number, forcedRepeat?: number) => {
      if (!parallel) return;
      const repetitions = forcedRepeat ?? repeatCount;
      const key = `${index}-${side}`;
      const audioUrl = segment.audio?.[side];
      if (audioUrl) {
        playCached(audioUrl, repetitions, key);
        return;
      }
      const text = side === 'source' ? segment.source : segment.target;
      const lang = side === 'source' ? parallel.sourceLanguage : parallel.targetLanguage;
      speak(text, lang, repetitions, key);
    },
    [parallel, playCached, repeatCount, speak]
  );

  if (!parallel) return null;

  const sourceLabel = shortLang(parallel.sourceLanguage);
  const targetLabel = shortLang(parallel.targetLanguage);
  const visible = parallel.segments.slice(0, visibleCount);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-3 sm:bottom-6 sm:right-6 z-[180] flex items-center gap-2 rounded-full border border-amber-500/40 bg-stone-950/95 px-4 py-2 text-xs font-bold tracking-wide text-amber-100 shadow-2xl backdrop-blur hover:bg-stone-900"
          title="Open bilingual study mode"
        >
          <Languages size={16} />
          {sourceLabel} ↔ {targetLabel}
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[220] overflow-y-auto bg-stone-950/95 text-stone-100 backdrop-blur-md">
          <div className="sticky top-0 z-10 border-b border-white/10 bg-stone-950/95 px-3 py-3 backdrop-blur sm:px-6">
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <Languages size={18} className="text-amber-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">
                  {parallel.sourceTitle || filename}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-stone-500">
                  {sourceLabel} ↔ {targetLabel} · {parallel.segments.length} segments
                  {parallel.generatedBy ? ` · ${parallel.generatedBy}` : ''}
                </div>
              </div>

              <label className="hidden items-center gap-1 text-[10px] text-stone-400 sm:flex">
                speed
                <select
                  value={rate}
                  onChange={(event) => setRate(Number(event.target.value))}
                  className="rounded border border-white/10 bg-stone-900 px-2 py-1 text-stone-200"
                >
                  <option value={0.7}>0.7×</option>
                  <option value={0.82}>0.82×</option>
                  <option value={0.88}>0.88×</option>
                  <option value={1}>1×</option>
                </select>
              </label>

              <label className="flex items-center gap-1 text-[10px] text-stone-400">
                <Repeat2 size={13} />
                <select
                  value={repeatCount}
                  onChange={(event) => setRepeatCount(Number(event.target.value))}
                  className="rounded border border-white/10 bg-stone-900 px-2 py-1 text-stone-200"
                >
                  <option value={1}>1×</option>
                  <option value={3}>3×</option>
                  <option value={5}>5×</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  stopAudio();
                  setIsOpen(false);
                }}
                className="rounded-full p-2 text-stone-400 hover:bg-white/10 hover:text-white"
                aria-label="Close study mode"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
            <div className="mb-3 hidden grid-cols-2 gap-4 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 sm:grid">
              <div>{sourceLabel} original</div>
              <div>{targetLabel} translation</div>
            </div>

            <div className="space-y-3">
              {visible.map((segment, index) => (
                <article
                  key={segment.id ?? index}
                  className="overflow-hidden rounded-xl border border-white/10 bg-stone-900/60 shadow-lg"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    <section className="border-b border-white/10 p-4 sm:border-b-0 sm:border-r">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[9px] font-mono text-amber-500/80">{index + 1} · {sourceLabel}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => playSegment(segment, 'source', index)}
                            className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-stone-300 hover:border-amber-500/40 hover:text-amber-200"
                          >
                            <Volume2 size={12} /> {activeKey === `${index}-source` ? '■' : '▶'}
                          </button>
                          <button
                            type="button"
                            onClick={() => playSegment(segment, 'source', index, 3)}
                            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-stone-400 hover:border-amber-500/40 hover:text-amber-200"
                            title="Repeat French three times"
                          >
                            ×3
                          </button>
                        </div>
                      </div>
                      <p className="font-serif text-[1.05rem] leading-7 text-stone-100">{segment.source}</p>
                    </section>

                    <section className="p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[9px] font-mono text-stone-500">{index + 1} · {targetLabel}</span>
                        <button
                          type="button"
                          onClick={() => playSegment(segment, 'target', index)}
                          className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-stone-300 hover:border-amber-500/40 hover:text-amber-200"
                        >
                          <Volume2 size={12} /> {activeKey === `${index}-target` ? '■' : '▶'}
                        </button>
                      </div>
                      <p className="font-serif text-[1rem] leading-7 text-stone-300">{segment.target}</p>
                    </section>
                  </div>
                </article>
              ))}
            </div>

            {visibleCount < parallel.segments.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + SEGMENT_STEP)}
                className="mt-6 w-full rounded-xl border border-white/10 bg-stone-900 px-4 py-3 text-xs font-bold text-stone-300 hover:border-amber-500/30 hover:text-amber-200"
              >
                Load next {Math.min(SEGMENT_STEP, parallel.segments.length - visibleCount)} segments
              </button>
            )}
          </main>
        </div>
      )}
    </>
  );
};

export default ParallelStudyOverlay;
