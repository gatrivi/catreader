import React, { useEffect, useRef, useState } from 'react';
import ePub, { Rendition } from 'epubjs';
import { Loader2, ChevronLeft, ChevronRight, Link2, Search } from 'lucide-react';

interface EpubViewProps {
  fileUrl: string;
  theme: string;
  initialLocation?: string | number;
  onLocationChange?: (cfi: string) => void;
  onTocLoaded?: (toc: any) => void;
}

type EpubUrlState = {
  cfi?: string;
  highlight?: string;
  query?: string;
  index?: number;
};

type EpubSearchHit = {
  cfi: string;
  excerpt?: string;
};

const HIGHLIGHT_CLASS = 'catreader-url-highlight';
const HIGHLIGHT_STYLE = {
  fill: 'rgba(245, 158, 11, 0.36)',
  'fill-opacity': '0.36',
  'mix-blend-mode': 'multiply',
};

function readEpubUrlState(): EpubUrlState {
  const rawHash = window.location.hash.replace(/^#/, '');
  if (!rawHash) return {};

  const params = new URLSearchParams(rawHash);
  const indexRaw = params.get('i') || params.get('instance');
  const index = indexRaw ? parseInt(indexRaw, 10) : undefined;

  return {
    cfi: params.get('cfi') || params.get('epubcfi') || undefined,
    highlight: params.get('hl') || params.get('highlight') || undefined,
    query: params.get('q') || params.get('search') || undefined,
    index: index && index > 0 ? index : undefined,
  };
}

function writeEpubUrlState(next: EpubUrlState) {
  const params = new URLSearchParams();
  if (next.query) params.set('q', next.query);
  if (next.index) params.set('i', String(next.index));
  if (next.cfi) params.set('cfi', next.cfi);
  if (next.highlight) params.set('hl', next.highlight);

  const url = new URL(window.location.href);
  url.hash = params.toString();
  window.history.replaceState(window.history.state, '', url.toString());
}

function addUrlHighlight(rendition: Rendition, cfiRange?: string) {
  if (!cfiRange) return;
  try {
    (rendition.annotations as any).remove(cfiRange, 'highlight');
  } catch {
    // Annotation may not exist yet.
  }

  try {
    (rendition.annotations as any).highlight(
      cfiRange,
      { source: 'url' },
      undefined,
      HIGHLIGHT_CLASS,
      HIGHLIGHT_STYLE
    );
  } catch (error) {
    console.warn('[EPUB] Could not apply URL highlight:', error);
  }
}

async function findInBook(book: any, query: string): Promise<EpubSearchHit[]> {
  const spineItems = book?.spine?.spineItems || [];
  const hits: EpubSearchHit[] = [];

  for (const item of spineItems) {
    try {
      await item.load(book.load.bind(book));
      const itemHits = item.find(query) || [];
      itemHits.forEach((hit: any) => {
        if (hit?.cfi) hits.push({ cfi: hit.cfi, excerpt: hit.excerpt });
      });
      item.unload?.();
    } catch (error) {
      console.warn('[EPUB] Search skipped spine item:', error);
    }
  }

  return hits;
}

export const EpubView: React.FC<EpubViewProps> = ({ 
  fileUrl, 
  theme, 
  initialLocation,
  onLocationChange,
  onTocLoaded 
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const currentCfiRef = useRef<string | undefined>(undefined);
  const highlightedCfiRef = useRef<string | undefined>(undefined);
  const searchStateRef = useRef<Pick<EpubUrlState, 'query' | 'index'>>({});
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<EpubSearchHit[]>([]);
  const [searchIndex, setSearchIndex] = useState<number>(0);
  const [isSearching, setIsSearching] = useState(false);

  const applyTheme = () => {
    if (!renditionRef.current) return;
    
    const themeStyles: any = {
      body: {
        background: 'transparent !important',
        color: theme === 'dark' ? '#d1d5db' : theme === 'sepia' ? '#433422' : '#1c1917',
        'font-family': 'serif !important',
        'font-size': '18px !important',
        'line-height': '1.6 !important'
      },
      '::selection': {
        background: 'rgba(245, 158, 11, 0.35) !important',
        color: 'inherit !important'
      },
      `.${HIGHLIGHT_CLASS}`: {
        fill: 'rgba(245, 158, 11, 0.36) !important',
        'fill-opacity': '0.36 !important',
        'mix-blend-mode': 'multiply'
      }
    };

    renditionRef.current.themes.register('custom', themeStyles);
    renditionRef.current.themes.select('custom');
  };

  const jumpToSearchHit = async (
    query: string,
    hits: EpubSearchHit[],
    nextIndex: number
  ) => {
    const rendition = renditionRef.current;
    const target = hits[nextIndex - 1];
    if (!rendition || !target) return;

    searchStateRef.current = { query, index: nextIndex };
    highlightedCfiRef.current = target.cfi;
    setSearchIndex(nextIndex);
    setSearchQuery(query);

    await rendition.display(target.cfi);
    addUrlHighlight(rendition, target.cfi);
    writeEpubUrlState({
      query,
      index: nextIndex,
      cfi: target.cfi,
      highlight: target.cfi,
    });
    setShareUrl(window.location.href);
  };

  const runSearch = async (query = searchQuery, requestedIndex = 1) => {
    const cleanQuery = query.trim();
    if (!cleanQuery || !bookRef.current) return;

    setIsSearching(true);
    try {
      const hits = await findInBook(bookRef.current, cleanQuery);
      setSearchHits(hits);
      const safeIndex = Math.min(Math.max(1, requestedIndex), Math.max(1, hits.length));
      if (hits.length > 0) {
        await jumpToSearchHit(cleanQuery, hits, safeIndex);
      } else {
        searchStateRef.current = { query: cleanQuery, index: undefined };
        writeEpubUrlState({
          query: cleanQuery,
          cfi: currentCfiRef.current,
          highlight: highlightedCfiRef.current,
        });
      }
    } catch (error) {
      console.error('[EPUB] Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (!viewerRef.current) return;

    setLoading(true);
    setShareUrl('');
    setSearchHits([]);
    setSearchIndex(0);
    highlightedCfiRef.current = undefined;
    searchStateRef.current = {};

    const urlState = readEpubUrlState();
    if (urlState.query) {
      setSearchQuery(urlState.query);
      if (urlState.index) setSearchIndex(urlState.index);
      searchStateRef.current = { query: urlState.query, index: urlState.index };
    }

    const targetLocation = urlState.cfi || initialLocation;
    const book = ePub(fileUrl);
    bookRef.current = book;

    const rendition = book.renderTo(viewerRef.current, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      manager: 'default',
    });

    renditionRef.current = rendition;

    const displayPromise = targetLocation 
      ? rendition.display(targetLocation.toString()) 
      : rendition.display();

    displayPromise.then(async () => {
      setLoading(false);
      applyTheme();

      if (urlState.highlight) {
        highlightedCfiRef.current = urlState.highlight;
        addUrlHighlight(rendition, urlState.highlight);
        setShareUrl(window.location.href);
      }

      if (urlState.query) {
        await runSearch(urlState.query, urlState.index || 1);
      }
    }).catch((error) => {
      console.error('[EPUB] Display failed:', error);
      setLoading(false);
    });

    book.loaded.navigation.then((nav) => {
      if (onTocLoaded) onTocLoaded(nav.toc);
    });

    rendition.on('relocated', (location: any) => {
      const cfi = location?.start?.cfi;
      if (!cfi) return;
      currentCfiRef.current = cfi;
      if (onLocationChange) onLocationChange(cfi);
      writeEpubUrlState({
        ...searchStateRef.current,
        cfi,
        highlight: highlightedCfiRef.current,
      });
      if (highlightedCfiRef.current || searchStateRef.current.query) {
        setShareUrl(window.location.href);
      }
    });

    rendition.on('selected', (cfiRange: string, contents: any) => {
      if (!cfiRange) return;
      highlightedCfiRef.current = cfiRange;
      addUrlHighlight(rendition, cfiRange);
      writeEpubUrlState({
        ...searchStateRef.current,
        cfi: currentCfiRef.current || cfiRange,
        highlight: cfiRange,
      });
      setShareUrl(window.location.href);

      try {
        contents?.window?.getSelection()?.removeAllRanges();
      } catch {
        // Selection cleanup is non-critical.
      }
    });

    // Handle internal links
    rendition.on('linkClicked', (href: string) => {
      rendition.display(href);
    });

    return () => {
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
      renditionRef.current = null;
    };
  }, [fileUrl]);

  useEffect(() => {
    applyTheme();
  }, [theme]);

  const copyShareUrl = async () => {
    const url = shareUrl || window.location.href;
    await navigator.clipboard.writeText(url);
    setShareUrl(url);
  };

  const goToRelativeSearchHit = (offset: number) => {
    if (!searchHits.length || !searchQuery.trim()) return;
    const nextIndex = ((searchIndex - 1 + offset + searchHits.length) % searchHits.length) + 1;
    jumpToSearchHit(searchQuery, searchHits, nextIndex);
  };

  const next = () => renditionRef.current?.next();
  const prev = () => renditionRef.current?.prev();

  return (
    <div className="relative w-full h-full flex flex-col bg-transparent">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="animate-spin text-amber-600" size={48} />
        </div>
      )}
      
      <div ref={viewerRef} className="flex-1 w-full max-w-4xl mx-auto" />

      {!loading && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(searchQuery, 1);
          }}
          className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-stone-950/75 px-2 py-1.5 text-[10px] text-stone-100 shadow-xl backdrop-blur-md"
        >
          <Search size={12} className="text-stone-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar"
            className="w-28 bg-transparent px-1 text-[11px] outline-none placeholder:text-stone-500 sm:w-40"
          />
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="rounded-full bg-amber-500/20 px-2 py-1 font-bold uppercase tracking-widest text-amber-200 disabled:opacity-40"
          >
            {isSearching ? '...' : 'Go'}
          </button>
          {searchHits.length > 0 && (
            <>
              <button type="button" onClick={() => goToRelativeSearchHit(-1)} className="px-1 text-stone-300 hover:text-white">‹</button>
              <span className="min-w-12 text-center font-mono text-[10px] text-stone-300">
                {searchIndex}/{searchHits.length}
              </span>
              <button type="button" onClick={() => goToRelativeSearchHit(1)} className="px-1 text-stone-300 hover:text-white">›</button>
            </>
          )}
        </form>
      )}
      
      {shareUrl && !loading && (
        <button
          onClick={copyShareUrl}
          className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-amber-500/30 bg-stone-950/75 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-200 shadow-xl backdrop-blur-md hover:bg-stone-900"
          title="Copiar enlace a esta selección"
        >
          <Link2 size={12} />
          Copiar selección
        </button>
      )}

      {/* EPUB Navigation Controls Overlay */}
      {!loading && (
        <div className="absolute inset-y-0 left-0 right-0 pointer-events-none flex justify-between items-center px-4">
          <button 
            onClick={prev}
            className="pointer-events-auto p-4 rounded-full bg-stone-900/10 hover:bg-stone-900/30 text-stone-500/50 hover:text-stone-700 transition-all"
          >
            <ChevronLeft size={32} />
          </button>
          <button 
            onClick={next}
            className="pointer-events-auto p-4 rounded-full bg-stone-900/10 hover:bg-stone-900/30 text-stone-500/50 hover:text-stone-700 transition-all"
          >
            <ChevronRight size={32} />
          </button>
        </div>
      )}
    </div>
  );
};