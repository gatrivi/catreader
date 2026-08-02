import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Flag,
  Library,
  Loader2,
  RefreshCw,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import type { LibraryBook } from '../hooks/useLibrary';
import {
  feedLocationLabel,
  shuffleFeedIds,
  type ReadingFeedItem,
} from '../utils/readingFeed';
import {
  buildFragmentReport,
  REPORT_REASON_LABELS,
  saveFragmentReport,
  type FragmentReportReason,
} from '../utils/fragmentReports';

interface ReadingFeedViewProps {
  library: LibraryBook[];
  onOpenItem: (item: ReadingFeedItem, book: LibraryBook) => void;
  onWarmBook: (book: LibraryBook) => void;
  onBack: () => void;
  appVersion?: string;
  onReportSaved?: () => void;
}

const ORDER_KEY = 'catreader_reading_feed_order';
const SCROLL_KEY = 'catreader_reading_feed_scroll';
const PREFERENCES_KEY = 'catreader_reading_feed_preferences';
const INITIAL_ITEMS = 18;
const LOAD_MORE = 12;

type FeedPreferences = {
  boostedBooks: string[];
  deprioritizedBooks: string[];
  savedItems: string[];
};

function readFeedPreferences(): FeedPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}') as Partial<FeedPreferences>;
    const strings = (value: unknown) => (
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    );
    return {
      boostedBooks: strings(parsed.boostedBooks),
      deprioritizedBooks: strings(parsed.deprioritizedBooks),
      savedItems: strings(parsed.savedItems),
    };
  } catch {
    return { boostedBooks: [], deprioritizedBooks: [], savedItems: [] };
  }
}

function writeFeedPreferences(preferences: FeedPreferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Private browsing or a full store should not block reading.
  }
}

function reorderBookIds(
  order: string[],
  catalog: ReadingFeedItem[],
  filename: string,
  direction: 'more' | 'less'
) {
  const bookIds = new Set(catalog.filter((item) => item.filename === filename).map((item) => item.id));
  const matching = order.filter((id) => bookIds.has(id));
  const rest = order.filter((id) => !bookIds.has(id));
  return direction === 'more' ? [...matching, ...rest] : [...rest, ...matching];
}

function applyFeedPreferences(
  order: string[],
  catalog: ReadingFeedItem[],
  preferences: FeedPreferences
) {
  let nextOrder = order;
  preferences.boostedBooks.forEach((filename) => {
    nextOrder = reorderBookIds(nextOrder, catalog, filename, 'more');
  });
  preferences.deprioritizedBooks.forEach((filename) => {
    nextOrder = reorderBookIds(nextOrder, catalog, filename, 'less');
  });
  return nextOrder;
}

function feedUrl() {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}feed.json`;
}

function readSeed() {
  const stored = sessionStorage.getItem(ORDER_KEY);
  if (stored) return null;
  const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff);
  sessionStorage.setItem(`${ORDER_KEY}:seed`, String(seed));
  return seed;
}

export function ReadingFeedView({
  library,
  onOpenItem,
  onWarmBook,
  onBack,
  appVersion = 'unknown',
  onReportSaved,
}: ReadingFeedViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const warmedBooksRef = useRef(new Set<string>());
  const [catalog, setCatalog] = useState<ReadingFeedItem[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_ITEMS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportingItem, setReportingItem] = useState<ReadingFeedItem | null>(null);
  const [reportReason, setReportReason] = useState<FragmentReportReason>('cut');
  const [reportNote, setReportNote] = useState('');
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<FeedPreferences>(() => readFeedPreferences());
  const preferencesRef = useRef(preferences);

  const bookMap = useMemo(
    () => new Map(library.map((book) => [book.filename, book])),
    [library]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(feedUrl())
      .then((response) => {
        if (!response.ok) throw new Error(`feed.json: ${response.status}`);
        return response.json();
      })
      .then((payload: { items?: ReadingFeedItem[] }) => {
        if (cancelled) return;
        const nextCatalog = (payload.items || []).filter((item) => bookMap.has(item.filename));
        const byId = new Map(nextCatalog.map((item) => [item.id, item]));
        const storedOrder = sessionStorage.getItem(ORDER_KEY);
        let nextOrder: string[];

        if (storedOrder) {
          try {
            nextOrder = (JSON.parse(storedOrder) as string[]).filter((id) => byId.has(id));
          } catch {
            nextOrder = [];
          }
        } else {
          const seed = Number(sessionStorage.getItem(`${ORDER_KEY}:seed`)) || readSeed() || Date.now();
          nextOrder = shuffleFeedIds(nextCatalog, seed);
        }

        if (nextOrder.length < nextCatalog.length) {
          const included = new Set(nextOrder);
          nextOrder.push(...shuffleFeedIds(nextCatalog, 17).filter((id) => !included.has(id)));
        }

        nextOrder = applyFeedPreferences(nextOrder, nextCatalog, preferencesRef.current);
        sessionStorage.setItem(ORDER_KEY, JSON.stringify(nextOrder));
        setCatalog(nextCatalog);
        setOrder(nextOrder);
        setVisibleCount(Math.min(INITIAL_ITEMS, nextOrder.length));
        setError(nextOrder.length ? null : 'No hay fragmentos disponibles para esta biblioteca.');
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el feed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookMap]);

  const itemsById = useMemo(
    () => new Map(catalog.map((item) => [item.id, item])),
    [catalog]
  );
  const visibleItems = useMemo(
    () => order.slice(0, visibleCount).map((id) => itemsById.get(id)).filter(Boolean) as ReadingFeedItem[],
    [itemsById, order, visibleCount]
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || loading) return;
    const storedScroll = Number(sessionStorage.getItem(SCROLL_KEY));
    if (storedScroll > 0) {
      requestAnimationFrame(() => node.scrollTo({ top: storedScroll, behavior: 'instant' }));
    }
  }, [loading]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    sessionStorage.setItem(SCROLL_KEY, String(node.scrollTop));
    if (node.scrollTop + node.clientHeight * 2 > node.scrollHeight) {
      setVisibleCount((count) => Math.min(count + LOAD_MORE, order.length));
    }
  };

  const warmOnce = (book: LibraryBook) => {
    if (warmedBooksRef.current.has(book.filename)) return;
    warmedBooksRef.current.add(book.filename);
    onWarmBook(book);
  };

  const updatePreferences = (update: (current: FeedPreferences) => FeedPreferences) => {
    const next = update(preferencesRef.current);
    preferencesRef.current = next;
    setPreferences(next);
    writeFeedPreferences(next);
  };

  const setBookTaste = (item: ReadingFeedItem, direction: 'more' | 'less') => {
    updatePreferences((current) => {
      const boostedBooks = new Set(current.boostedBooks);
      const deprioritizedBooks = new Set(current.deprioritizedBooks);
      if (direction === 'more') {
        boostedBooks.add(item.filename);
        deprioritizedBooks.delete(item.filename);
      } else {
        deprioritizedBooks.add(item.filename);
        boostedBooks.delete(item.filename);
      }
      return {
        ...current,
        boostedBooks: [...boostedBooks],
        deprioritizedBooks: [...deprioritizedBooks],
      };
    });
    setOrder((currentOrder) => {
      const nextOrder = reorderBookIds(currentOrder, catalog, item.filename, direction);
      sessionStorage.setItem(ORDER_KEY, JSON.stringify(nextOrder));
      return nextOrder;
    });
    setReportMessage(direction === 'more'
      ? 'MÃ¡s fragmentos de ' + item.title + '.'
      : item.title + ' queda al final del feed.');
  };

  const skipItem = (item: ReadingFeedItem) => {
    setOrder((currentOrder) => {
      const nextOrder = currentOrder.filter((id) => id !== item.id);
      sessionStorage.setItem(ORDER_KEY, JSON.stringify(nextOrder));
      return nextOrder;
    });
    if (order.length <= 1) setError('No quedan fragmentos. MezclÃ¡ para empezar de nuevo.');
    setReportMessage('Fragmento salteado.');
  };

  const toggleSaved = (item: ReadingFeedItem) => {
    const savedItems = new Set(preferencesRef.current.savedItems);
    const wasSaved = savedItems.has(item.id);
    if (wasSaved) savedItems.delete(item.id);
    else savedItems.add(item.id);
    updatePreferences((current) => ({ ...current, savedItems: [...savedItems] }));
    setReportMessage(wasSaved ? 'Quitado de guardados.' : 'Fragmento guardado en este dispositivo.');
  };

  const refresh = () => {
    sessionStorage.removeItem(ORDER_KEY);
    sessionStorage.removeItem(`${ORDER_KEY}:seed`);
    sessionStorage.removeItem(SCROLL_KEY);
    window.location.reload();
  };

  const saveReport = () => {
    if (!reportingItem) return;
    try {
      saveFragmentReport(buildFragmentReport(reportingItem, reportReason, appVersion, reportNote));
      onReportSaved?.();
      setReportingItem(null);
      setReportNote('');
      setReportMessage('Reporte guardado en este dispositivo.');
    } catch {
      setReportMessage('No se pudo guardar. LiberÃ¡ espacio del navegador y probÃ¡ de nuevo.');
    }
  };

  return (
    <div className="h-full bg-stone-950 text-stone-100 flex flex-col">
      <header className="shrink-0 z-20 border-b border-white/10 bg-stone-950/90 backdrop-blur-md px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-stone-300 hover:bg-white/10 hover:text-white"
            aria-label="Volver a la biblioteca"
          >
            <Library size={18} className="text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Biblioteca</span>
          </button>
          <div className="text-center">
            <h1 className="font-serif text-lg font-bold tracking-tight">Descubrir</h1>
            <p className="text-[9px] uppercase tracking-[0.24em] text-stone-500">fragmentos al azar</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-400 hover:bg-white/10 hover:text-amber-300"
            aria-label="Mezclar fragmentos"
            title="Mezclar fragmentos"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>
      {reportMessage && <p role="status" className="absolute bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-emerald-500/20 bg-stone-900/95 px-4 py-2 text-center text-xs text-emerald-300 shadow-xl">{reportMessage}</p>}

      <div ref={scrollRef} onScroll={handleScroll} role="feed" className="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-none">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-3 text-stone-500">
            <Loader2 size={20} className="animate-spin text-amber-500" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Preparando fragmentos</span>
          </div>
        ) : error ? (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center px-6 text-center">
            <BookOpen size={38} className="mb-4 text-stone-700" />
            <p className="text-sm text-stone-400">{error}</p>
            <button type="button" onClick={refresh} className="mt-5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-500">
              Reintentar
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            {visibleItems.map((item) => {
              const book = bookMap.get(item.filename);
              if (!book) return null;
              return (
                <article key={item.id} className="min-h-[calc(100dvh-5rem)] snap-start px-3 py-3 sm:px-6 sm:py-6">
                  <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col rounded-[2rem] border border-white/10 bg-stone-900/75 p-4 text-left shadow-2xl shadow-black/20 sm:min-h-[calc(100dvh-8rem)] sm:p-7">
                    <div className="group flex min-h-0 flex-1 flex-col justify-between text-left">
                      <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.2em] text-stone-500">
                        <span className="flex min-w-0 items-center gap-2 truncate">
                          <BookOpen size={13} className="shrink-0 text-amber-500" />
                          <span className="truncate">{item.title}</span>
                        </span>
                        <span className="shrink-0">{feedLocationLabel(item.locator)}</span>
                      </div>
                      <p className="my-6 line-clamp-8 font-serif text-[clamp(1.35rem,4vw,2.55rem)] leading-[1.3] text-stone-100 sm:my-8 sm:line-clamp-12">
                        {item.text}
                      </p>
                      <div className="flex items-end justify-between gap-4 border-t border-white/10 pt-4">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-stone-300">{item.author || 'Autor desconocido'}</p>
                          <p className="mt-1 text-[9px] uppercase tracking-widest text-stone-600">TocÃ¡ para leer en el libro</p>
                        </div>
                        <button
                          type="button"
                          onPointerDown={() => warmOnce(book)}
                          onMouseEnter={() => warmOnce(book)}
                          onClick={() => onOpenItem(item, book)}
                          className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-amber-600 px-3 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-amber-500"
                          aria-label={'Abrir ' + item.title + ' en el libro'}
                        >
                          <span>Abrir</span>
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1 border-t border-white/5 pt-2">
                      <button
                        type="button"
                        onClick={() => setBookTaste(item, 'more')}
                        className="flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[9px] font-bold text-stone-500 hover:bg-white/5 hover:text-emerald-300 sm:flex-row sm:gap-1"
                        title="Ver mÃ¡s fragmentos de este libro"
                        aria-label="MÃ¡s fragmentos de este libro"
                      >
                        <ThumbsUp size={14} />
                        <span>MÃ¡s asÃ­</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => skipItem(item)}
                        className="flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[9px] font-bold text-stone-500 hover:bg-white/5 hover:text-amber-300 sm:flex-row sm:gap-1"
                        title="Saltar este fragmento"
                        aria-label="Otro fragmento"
                      >
                        <SkipForward size={14} />
                        <span>Otro</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSaved(item)}
                        className="flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[9px] font-bold text-stone-500 hover:bg-white/5 hover:text-amber-300 sm:flex-row sm:gap-1"
                        title="Guardar en este dispositivo"
                        aria-label={preferences.savedItems.includes(item.id) ? 'Quitar de guardados' : 'Guardar fragmento'}
                        aria-pressed={preferences.savedItems.includes(item.id)}
                      >
                        {preferences.savedItems.includes(item.id) ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                        <span>{preferences.savedItems.includes(item.id) ? 'Guardado' : 'Guardar'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBookTaste(item, 'less')}
                        className="flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[9px] font-bold text-stone-500 hover:bg-white/5 hover:text-rose-300 sm:flex-row sm:gap-1"
                        title="Poner este libro al final del feed"
                        aria-label="Menos fragmentos de este libro"
                      >
                        <ThumbsDown size={14} />
                        <span>Menos</span>
                      </button>
                    </div>
                    <div className="mt-3 flex justify-end border-t border-white/5 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setReportingItem(item);
                          setReportReason('cut');
                          setReportNote('');
                          setReportMessage(null);
                        }}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-stone-600 hover:bg-white/5 hover:text-amber-300"
                      >
                        <Flag size={12} /> Reportar fragmento
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {visibleCount < order.length && (
              <div className="pb-12 text-center text-[9px] uppercase tracking-widest text-stone-700">MÃ¡s fragmentos abajo</div>
            )}
          </div>
        )}
      </div>

      {reportingItem && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-5 backdrop-blur-sm"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setReportingItem(null);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="report-fragment-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-stone-950 p-5 text-stone-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Control de calidad</p>
                <h2 id="report-fragment-title" className="mt-1 font-serif text-xl font-bold">Â¿QuÃ© estÃ¡ mal?</h2>
                <p className="mt-1 line-clamp-2 text-xs text-stone-500">{reportingItem.text}</p>
              </div>
              <button type="button" onClick={() => setReportingItem(null)} aria-label="Cerrar reporte" className="rounded-full p-2 text-stone-500 hover:bg-white/10 hover:text-white"><X size={18} /></button>
            </div>
            <div className="mt-5 space-y-2">
              {(Object.entries(REPORT_REASON_LABELS) as Array<[FragmentReportReason, string]>).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-stone-300 hover:bg-white/5">
                  <input type="radio" name="fragment-report-reason" value={value} checked={reportReason === value} onChange={() => setReportReason(value)} className="accent-amber-500" />
                  {label}
                </label>
              ))}
            </div>
            <textarea
              value={reportNote}
              onChange={(event) => setReportNote(event.target.value)}
              placeholder="Detalle opcionalâ€¦"
              rows={3}
              className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-stone-900 p-3 text-xs text-white outline-none placeholder:text-stone-600 focus:border-amber-500/50"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReportingItem(null)} className="rounded-xl px-3 py-2 text-xs font-bold text-stone-500 hover:bg-white/10 hover:text-white">Cancelar</button>
              <button type="button" onClick={saveReport} className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-500">Guardar reporte</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

