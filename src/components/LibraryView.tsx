import { useState, useRef, useCallback, useEffect } from 'react';
import { Library, Cloud, Upload, Loader2, Pencil, ChevronLeft, ChevronRight, Wand2, ImagePlus, User, Sparkles, X, Search, Package2, Route } from 'lucide-react';
import { BookCover } from './BookCover';
import { SaintsTrailView } from './SaintsTrailView';
import { authService } from '../services/authService';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Shelf } from '../hooks/useShelves';
import { filterLibraryBooks } from '../utils/reader';

const LIBRARY_MODE_KEY = 'catreader_library_mode';
type LibraryMode = 'racks' | 'saints-trail';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LibraryBook {
  id: string;
  title: string;
  author?: string;
  filename: string;
  type: string;
}

interface Highlight {
  id: string;
  bookId: string;
  bookTitle: string;
  text: string;
  page?: number;
  createdAt: number;
}

interface LibraryViewProps {
  library: LibraryBook[];
  covers: Record<string, string>;
  isLoading: boolean;
  onOpenBook: (book: LibraryBook) => void;
  onEditBook: (book: LibraryBook) => void;
  onGoogleDrive: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isSimplified: boolean;
  wallpaper: string;
  customWallpaper: string | null;
  onToggleSimplified: () => void;
  onSetWallpaper: (w: string) => void;
  onSetCustomWallpaper: (dataUrl: string) => void;
  shelves: Shelf[];
  onUpdateShelfTitle: (shelfId: string, title: string) => void;
  onMoveBook: (bookId: string, fromShelfId: string, toShelfId: string, toIndex?: number) => void;
  onReorderBook: (shelfId: string, fromIndex: number, toIndex: number) => void;
  onMagicEnrich?: () => void;
  onOpenLibraryEnrich?: () => void;
  onProfileClick?: () => void;
  identifyingBookId?: string | null;
  isSyncing?: boolean;
  enrichmentProgress?: { current: number; total: number; filename?: string };
  onShareBook?: (book: LibraryBook) => void;
  dailyHighlight?: Highlight | null;
  onDismissHighlight?: () => void;
  onConsolidate?: () => void;
  onGetProgress?: (bookId: string) => number;
  savedBookCovers?: Record<string, boolean>;
  showCoverLabels?: boolean;
  onToggleCoverLabels?: () => void;
  onAddShelf?: () => void;
  onRemoveShelf?: (shelfId: string) => { count: number; destinationIndex: number } | null | void;
}

const RACKS_PER_PAGE = 4; // Not used anymore but kept for compatibility if needed

export const LibraryView = ({ 
  library, 
  covers,
  isLoading,
  onOpenBook, 
  onEditBook, 
  onGoogleDrive, 
  onFileUpload,
  isSimplified,
  wallpaper,
  customWallpaper,
  onToggleSimplified,
  onSetWallpaper,
  onSetCustomWallpaper,
  shelves,
  onUpdateShelfTitle,
  onMoveBook,
  onReorderBook,
  onMagicEnrich,
  onOpenLibraryEnrich,
  onProfileClick,
  identifyingBookId,
  isSyncing,
  enrichmentProgress,
  onShareBook,
  dailyHighlight,
  onDismissHighlight,
  onConsolidate,
  onGetProgress,
  savedBookCovers,
  showCoverLabels,
  onToggleCoverLabels,
  onAddShelf,
  onRemoveShelf
  }: LibraryViewProps) => {

  const [searchQuery, setSearchQuery] = useState('');
  const [currentRack, setCurrentRack] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const [libraryMode, setLibraryMode] = useState<LibraryMode>(() => {
    const stored = localStorage.getItem(LIBRARY_MODE_KEY);
    return stored === 'saints-trail' ? 'saints-trail' : 'racks';
  });
  const settingsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pfp = authService.getPFP();

  const setMode = (mode: LibraryMode) => {
    setLibraryMode(mode);
    localStorage.setItem(LIBRARY_MODE_KEY, mode);
  };

  const filteredBooks = filterLibraryBooks(library, searchQuery);
  const svgDataUrl = pfp ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(pfp)))}` : null;
  const gastonPfpUrl = '/profile.jpg';

  const wallpapers: Record<string, string> = {
    gaston: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url("/background.jpg")',
    wood: 'linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url("https://www.transparenttextures.com/patterns/wood-pattern.png"), #2d1d13',
    dim: '#1c1917',
    slate: '#0f172a',
    glass: 'conic-gradient(from 0deg at 50% 50%, #4c1d95 0deg, #831843 60deg, #1e3a8a 120deg, #064e3b 180deg, #78350f 240deg, #4c1d95 300deg)'
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!showSettings) return;
    const handleClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSettings]);

  const handleCustomWallpaper = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onSetCustomWallpaper(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [dragState, setDragState] = useState<{
    bookId: string;
    fromShelfId: string;
    fromIndex: number;
  } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string; cover?: string } | null>(null);
  const [dragOverBook, setDragOverBook] = useState<{ shelfId: string; index: number } | null>(null);
  const [dragOverShelf, setDragOverShelf] = useState<string | null>(null);
  const liftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLiftRef = useRef<{
    bookId: string;
    fromShelfId: string;
    fromIndex: number;
    title: string;
    cover?: string;
    startX: number;
    startY: number;
    pointerId: number;
    isTouch: boolean;
  } | null>(null);
  const draggingRef = useRef(false);
  const dragPayloadRef = useRef<{ bookId: string; fromShelfId: string; fromIndex: number } | null>(null);
  const suppressClickRef = useRef(false);
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!dailyHighlight) return;
    const timer = setTimeout(() => onDismissHighlight?.(), 8000);
    return () => clearTimeout(timer);
  }, [dailyHighlight, onDismissHighlight]);

  const getBook = (id: string) => library.find(b => b.id === id);

  const clearLiftTimer = () => {
    if (liftTimerRef.current) {
      clearTimeout(liftTimerRef.current);
      liftTimerRef.current = null;
    }
  };

  const endPointerDrag = useCallback(() => {
    clearLiftTimer();
    pendingLiftRef.current = null;
    draggingRef.current = false;
    dragPayloadRef.current = null;
    setDragState(null);
    setGhost(null);
    setDragOverBook(null);
    setDragOverShelf(null);
    if (flipTimeoutRef.current) {
      clearTimeout(flipTimeoutRef.current);
      flipTimeoutRef.current = null;
    }
  }, []);

  const hitTestDrop = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const slot = el?.closest('[data-shelf-slot]') as HTMLElement | null;
    if (slot) {
      const shelfId = slot.dataset.shelfId!;
      const index = Number(slot.dataset.slotIndex);
      setDragOverBook({ shelfId, index });
      setDragOverShelf(shelfId);
      return { type: 'slot' as const, shelfId, index };
    }
    const rack = el?.closest('[data-rack-target]') as HTMLElement | null;
    if (rack) {
      const shelfId = rack.dataset.rackTarget!;
      setDragOverShelf(shelfId);
      setDragOverBook(null);
      return { type: 'rack' as const, shelfId };
    }
    setDragOverBook(null);
    return null;
  };

  const beginLift = (pending: NonNullable<typeof pendingLiftRef.current>, x: number, y: number) => {
    draggingRef.current = true;
    suppressClickRef.current = true;
    const payload = {
      bookId: pending.bookId,
      fromShelfId: pending.fromShelfId,
      fromIndex: pending.fromIndex,
    };
    dragPayloadRef.current = payload;
    setDragState(payload);
    setGhost({ x, y, title: pending.title, cover: pending.cover });
  };

  const onBookPointerDown = (
    e: React.PointerEvent,
    bookId: string,
    shelfId: string,
    index: number,
    title: string,
    cover?: string
  ) => {
    if (e.button !== 0) return;
    // ignore taps on edit/share buttons
    if ((e.target as HTMLElement).closest('button')) return;

    clearLiftTimer();
    const pending = {
      bookId,
      fromShelfId: shelfId,
      fromIndex: index,
      title,
      cover,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      isTouch: e.pointerType === 'touch',
    };
    pendingLiftRef.current = pending;

    if (pending.isTouch) {
      liftTimerRef.current = setTimeout(() => {
        if (pendingLiftRef.current === pending) {
          beginLift(pending, pending.startX, pending.startY);
        }
      }, 200);
    }
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pending = pendingLiftRef.current;
      if (!pending) return;

      if (!draggingRef.current) {
        const dist = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
        if (pending.isTouch) {
          if (dist > 12) {
            clearLiftTimer();
            pendingLiftRef.current = null;
          }
          return;
        }
        if (dist > 6) beginLift(pending, e.clientX, e.clientY);
        else return;
      }

      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      hitTestDrop(e.clientX, e.clientY);

      // edge-hold rack flip
      const edge = 48;
      if (e.clientX < edge && currentRack > 0) {
        if (!flipTimeoutRef.current) {
          flipTimeoutRef.current = setTimeout(() => {
            flipRack('prev');
            flipTimeoutRef.current = null;
          }, 500);
        }
      } else if (e.clientX > window.innerWidth - edge && currentRack < shelves.length - 1) {
        if (!flipTimeoutRef.current) {
          flipTimeoutRef.current = setTimeout(() => {
            flipRack('next');
            flipTimeoutRef.current = null;
          }, 500);
        }
      } else if (flipTimeoutRef.current) {
        clearTimeout(flipTimeoutRef.current);
        flipTimeoutRef.current = null;
      }
    };

    const onUp = (e: PointerEvent) => {
      clearLiftTimer();

      if (draggingRef.current && dragPayloadRef.current) {
        const ds = dragPayloadRef.current;
        const hit = hitTestDrop(e.clientX, e.clientY);
        if (hit?.type === 'slot') {
          if (ds.fromShelfId === hit.shelfId) {
            onReorderBook(hit.shelfId, ds.fromIndex, hit.index);
          } else {
            onMoveBook(ds.bookId, ds.fromShelfId, hit.shelfId, hit.index);
          }
        } else if (hit?.type === 'rack') {
          onMoveBook(ds.bookId, ds.fromShelfId, hit.shelfId);
        }
        endPointerDrag();
        setTimeout(() => { suppressClickRef.current = false; }, 0);
        return;
      }

      pendingLiftRef.current = null;
      if (!draggingRef.current) suppressClickRef.current = false;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', endPointerDrag);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', endPointerDrag);
    };
  }, [currentRack, shelves.length, onMoveBook, onReorderBook, endPointerDrag]);

  const [rackDirection, setRackDirection] = useState<'next' | 'prev'>('next');

  const goToRack = (idx: number) => {
    if (idx === currentRack || idx < 0 || idx >= shelves.length) return;
    setRackDirection(idx > currentRack ? 'next' : 'prev');
    setCurrentRack(idx);
  };

  useEffect(() => {
    if (shelves.length === 0) return;
    if (currentRack >= shelves.length) {
      setCurrentRack(shelves.length - 1);
    }
  }, [shelves.length, currentRack]);

  const flipRack = (dir: 'next' | 'prev') => {
    setRackDirection(dir);
    if (dir === 'next' && currentRack < shelves.length - 1) {
      setCurrentRack(prev => prev + 1);
    } else if (dir === 'prev' && currentRack > 0) {
      setCurrentRack(prev => prev - 1);
    }
  };

  const onRackSwipeStart = (e: React.TouchEvent) => {
    if (draggingRef.current) return;
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onRackSwipeEnd = (e: React.TouchEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || draggingRef.current) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) flipRack('next');
    else flipRack('prev');
  };

  const bgStyle = !isSimplified
    ? (wallpaper === 'custom' && customWallpaper
        ? `url(${customWallpaper})`
        : (wallpapers[wallpaper] || wallpapers.wood))
    : wallpapers.dim;

  return (
    <div 
      className={cn("h-full flex flex-col overflow-hidden", isSimplified ? "bg-stone-900" : "")} 
      style={{ 
        background: bgStyle.startsWith('url') || bgStyle.startsWith('#') || bgStyle.startsWith('linear') || bgStyle.startsWith('conic') ? bgStyle : `url(${bgStyle})`,
        backgroundSize: isSimplified ? 'auto' : 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Ambient Lighting & Vignette Overlay */}
      <AnimatePresence>
        {!isSimplified && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 pointer-events-none z-[5]"
            style={{ 
              background: hoverColor 
                ? `radial-gradient(circle at center, ${hoverColor}11 0%, rgba(0,0,0,0.6) 100%)`
                : 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.4) 100%)',
              transition: 'background 0.7s ease'
            }}
          />
        )}
      </AnimatePresence>

      {/* Compact Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 z-50">
        <div className="flex items-center justify-between gap-2 bg-stone-950/80 backdrop-blur-md p-2 rounded-2xl border border-white/5 shadow-2xl max-w-7xl mx-auto h-[56px]">
          <div className="flex items-center gap-2">
            <button 
              onClick={onProfileClick}
              className="group relative w-8 h-8 rounded-full bg-stone-900 border border-white/10 flex items-center justify-center overflow-hidden transition-all hover:border-amber-500/50 shadow-lg shrink-0"
              aria-label="Ver Perfil"
            >
              {svgDataUrl ? (
                <img src={svgDataUrl} alt="PFP" className="w-full h-full object-cover" />
              ) : (
                <img src={gastonPfpUrl} alt="PFP" className="w-full h-full object-cover" onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement?.querySelector('.fallback-user')?.classList.remove('hidden');
                }} />
              )}
              <User size={14} className="fallback-user text-stone-500 group-hover:text-amber-500 transition-colors hidden" />
            </button>
            <div className="hidden sm:block">
              <h1 className="text-sm font-serif font-bold text-white tracking-tight leading-none">Libros de Gaston</h1>
              <p className="text-[8px] text-stone-500 uppercase tracking-widest mt-0.5">CatReader</p>
            </div>
          </div>

          <div className="flex-1 max-w-md relative group mx-2">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 group-focus-within:text-amber-500 transition-colors" />
            <input 
              ref={searchInputRef}
              type="text"
              placeholder="Buscar libros..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/5 rounded-xl py-1.5 pl-9 pr-8 text-[11px] text-white placeholder:text-stone-600 outline-none focus:border-amber-500/50 transition-all shadow-inner"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-500 hover:text-white transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 pr-1.5 border-r border-white/5">
              <button 
                onClick={onGoogleDrive}
                className="flex items-center gap-1.5 bg-stone-900 text-stone-400 hover:text-white hover:bg-stone-800 transition-all px-2.5 py-1.5 rounded-xl text-[10px] font-bold border border-white/5 shrink-0"
                aria-label="Importar desde Google Drive"
              >
                <Cloud size={12} />
                <span className="hidden md:inline">Importar</span>
              </button>
              <label className="flex items-center gap-1.5 bg-amber-700 text-white hover:bg-amber-600 transition-all px-2.5 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer shadow-lg shadow-amber-950/50 shrink-0" aria-label="Añadir libro">
                <Upload size={12} />
                <span className="hidden md:inline">Añadir</span>
                <input type="file" accept=".pdf,.txt,.epub" className="hidden" onChange={onFileUpload} />
              </label>
            </div>

            <div className="relative" ref={settingsRef}>
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className={cn("w-8 h-8 rounded-xl bg-stone-900 border border-white/5 flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition-all shadow-lg", showSettings && "bg-stone-800 text-amber-500 border-amber-500/20")}
                aria-label="Settings"
              >
                <Sparkles size={14} className={cn(isSyncing && "animate-pulse")} />
              </button>

              <AnimatePresence>
                {showSettings && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-64 bg-stone-950/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 z-[100]"
                  >
                    <div className="space-y-4">
                      {/* Wallpaper Section */}
                      <div>
                        <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">Fondo de Biblioteca</p>
                        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/5">
                          <button 
                            onClick={() => onSetWallpaper('gaston')}
                            className={cn("w-6 h-6 rounded-lg bg-indigo-900 border border-white/10 transition-transform active:scale-95", wallpaper === 'gaston' && "ring-2 ring-amber-600")}
                            title="Gaston"
                            style={{ backgroundImage: 'url("/background.jpg")', backgroundSize: 'cover' }}
                          />
                          <button 
                            onClick={() => onSetWallpaper('wood')}
                            className={cn("w-6 h-6 rounded-lg bg-[#5c3a21] border border-white/10 transition-transform active:scale-95", wallpaper === 'wood' && "ring-2 ring-amber-600")}
                            title="Madera"
                          />
                          <button 
                            onClick={() => onSetWallpaper('dim')}
                            className={cn("w-6 h-6 rounded-lg bg-stone-800 border border-white/10 transition-transform active:scale-95", wallpaper === 'dim' && "ring-2 ring-amber-600")}
                            title="Dim"
                          />
                          <button 
                            onClick={() => onSetWallpaper('slate')}
                            className={cn("w-6 h-6 rounded-lg bg-slate-900 border border-white/10 transition-transform active:scale-95", wallpaper === 'slate' && "ring-2 ring-amber-600")}
                            title="Slate"
                          />
                          <button 
                            onClick={() => onSetWallpaper('glass')}
                            className={cn("w-6 h-6 rounded-lg border border-white/10 transition-transform active:scale-95", wallpaper === 'glass' && "ring-2 ring-amber-600")}
                            style={{ background: wallpapers.glass }}
                            title="Stained Glass"
                          />
                          <label 
                            className={cn("w-6 h-6 rounded-lg border border-white/10 transition-transform active:scale-95 flex items-center justify-center cursor-pointer overflow-hidden",
                              wallpaper === 'custom' && "ring-2 ring-amber-600"
                            )}
                            title="Custom"
                            style={customWallpaper ? { backgroundImage: `url(${customWallpaper})`, backgroundSize: 'cover' } : { background: '#444' }}
                          >
                            <ImagePlus size={10} className="text-white/70" />
                            <input type="file" accept="image/*" className="hidden" onChange={handleCustomWallpaper} />
                          </label>
                        </div>
                      </div>

                      {/* View Options */}
                      <div className="pt-2 border-t border-white/5 space-y-2">
                        <button
                          onClick={() => {
                            setMode(libraryMode === 'saints-trail' ? 'racks' : 'saints-trail');
                            setShowSettings(false);
                          }}
                          className="w-full flex items-center justify-between group"
                        >
                          <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                            <Route size={10} /> Sendero de Santos
                          </span>
                          <div className={cn("w-8 h-4 rounded-full border border-white/10 transition-all relative", libraryMode === 'saints-trail' ? "bg-amber-600" : "bg-stone-900")}>
                            <div className={cn("absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all", libraryMode === 'saints-trail' ? "left-4.5" : "left-0.5")} />
                          </div>
                        </button>
                        <button 
                          onClick={onToggleSimplified}
                          className="w-full flex items-center justify-between group"
                        >
                          <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Vista Simplificada</span>
                          <div className={cn("w-8 h-4 rounded-full border border-white/10 transition-all relative", isSimplified ? "bg-amber-600" : "bg-stone-900")}>
                            <div className={cn("absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all", isSimplified ? "left-4.5" : "left-0.5")} />
                          </div>
                        </button>
                        {onToggleCoverLabels && (
                          <button 
                            onClick={onToggleCoverLabels}
                            className="w-full flex items-center justify-between group"
                          >
                            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Mostrar Etiquetas</span>
                            <div className={cn("w-8 h-4 rounded-full border border-white/10 transition-all relative", showCoverLabels ? "bg-amber-600" : "bg-stone-900")}>
                              <div className={cn("absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all", showCoverLabels ? "left-4.5" : "left-0.5")} />
                            </div>
                          </button>
                        )}
                      </div>

                      {/* AI Actions */}
                      {(onMagicEnrich || onOpenLibraryEnrich || onConsolidate) && (
                        <div className="pt-2 border-t border-white/5 space-y-2">
                          <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Acciones AI</p>
                          {onMagicEnrich && (
                            <button 
                              onClick={() => { onMagicEnrich(); setShowSettings(false); }}
                              disabled={isSyncing}
                              className="w-full flex items-center gap-2 bg-indigo-900/40 text-indigo-200 hover:text-white hover:bg-indigo-800 transition-all px-3 py-2 rounded-xl text-[10px] font-bold border border-white/5 disabled:opacity-50"
                            >
                              <Wand2 size={12} className={cn(isSyncing && "animate-spin")} />
                              {isSyncing ? 'Enriqueciendo...' : 'Enriquecer Biblioteca'}
                            </button>
                          )}
                          {onOpenLibraryEnrich && (
                            <button
                              onClick={() => { onOpenLibraryEnrich(); setShowSettings(false); }}
                              disabled={isSyncing}
                              className="w-full flex items-center gap-2 bg-stone-900 text-stone-400 hover:text-sky-300 hover:bg-stone-800 transition-all px-3 py-2 rounded-xl text-[10px] font-bold border border-white/5 disabled:opacity-50"
                            >
                              <Library size={12} />
                              Open Library
                            </button>
                          )}
                          {onConsolidate && (
                            <button 
                              onClick={() => { onConsolidate(); setShowSettings(false); }}
                              className="w-full flex items-center gap-2 bg-stone-900 text-stone-400 hover:text-emerald-400 hover:bg-stone-800 transition-all px-3 py-2 rounded-xl text-[10px] font-bold border border-white/5"
                            >
                              <Package2 size={12} />
                              Agrupar Estantes
                            </button>
                          )}
                        </div>
                      )}

                      {enrichmentProgress && enrichmentProgress.total > 0 && (
                        <div className="pt-2 border-t border-white/5">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] font-mono text-indigo-400 font-bold uppercase">Procesando</span>
                            <span className="text-[9px] font-mono text-indigo-400 font-bold">{enrichmentProgress.current}/{enrichmentProgress.total}</span>
                          </div>
                          <div className="w-full h-1 bg-stone-900 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 transition-all duration-500" 
                              style={{ width: `${(enrichmentProgress.current / enrichmentProgress.total) * 100}%` }}
                            />
                          </div>
                          <p className="text-[8px] text-stone-500 truncate mt-1">{enrichmentProgress.filename}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-stone-400 gap-4">
            <Loader2 className="animate-spin text-amber-600" size={32} />
            <p className="font-serif italic tracking-wide">Preparando tus estantes...</p>
          </div>
        ) : library.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-16 bg-black/20 backdrop-blur-sm rounded-3xl border border-white/5 max-w-2xl mx-auto shadow-2xl px-8">
              <div className="w-20 h-20 bg-stone-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10">
                <Library size={32} className="text-stone-700" />
              </div>
              <h2 className="text-2xl font-serif text-white mb-2">Biblioteca vacía</h2>
              <button className="text-amber-500 font-bold" onClick={onGoogleDrive}>Importar Libros</button>
            </div>
          </div>
        ) : searchQuery ? (
          <div className="h-full overflow-y-auto scrollbar-thin px-4 sm:px-8 pt-32 pb-20">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-2xl font-serif text-white font-bold">Resultados</h2>
                  <p className="text-stone-500 text-xs uppercase tracking-widest mt-1">Buscando: {searchQuery}</p>
                </div>
                <p className="text-amber-500 text-sm font-bold bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                  {filteredBooks.length} {filteredBooks.length === 1 ? 'libro' : 'libros'}
                </p>
              </div>

              {filteredBooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-stone-600">
                  <div className="w-20 h-20 bg-stone-900/50 rounded-full flex items-center justify-center mb-6 border border-white/5">
                    <Search size={32} className="opacity-20" />
                  </div>
                  <p className="italic text-lg">No se encontraron coincidencias</p>
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="mt-4 text-amber-500 hover:text-amber-400 font-bold underline"
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-x-6 gap-y-16">
                  {filteredBooks.map(book => (
                    <div key={book.id} className="relative flex flex-col group/item">
                       <BookCover 
                          book={book}
                          cover={covers[book.filename]}
                          onClick={() => onOpenBook(book)}
                          onEdit={() => onEditBook(book)}
                          onShare={() => onShareBook?.(book)}
                          onHover={setHoverColor}
                          readingProgress={onGetProgress?.(book.filename)}
                          isSimplified={isSimplified}
                          isIdentifying={identifyingBookId === book.id}
                          isSavedInDb={savedBookCovers?.[book.filename]}
                        />
                        {!isSimplified && <ShelfLedge />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : libraryMode === 'saints-trail' ? (
          <SaintsTrailView
            library={library}
            covers={covers}
            onOpenBook={onOpenBook}
            onEditBook={onEditBook}
            onShareBook={onShareBook}
            onGetProgress={onGetProgress}
            isSimplified={isSimplified}
            identifyingBookId={identifyingBookId}
            savedBookCovers={savedBookCovers}
            showCoverLabels={showCoverLabels}
          />
        ) : (
          <div
            className="flex-1 relative flex flex-col items-center justify-center overflow-hidden min-h-0"
            onTouchStart={onRackSwipeStart}
            onTouchEnd={onRackSwipeEnd}
          >
            {/* Carousel Container */}
            <div className="flex w-full h-full min-h-0">
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={currentRack}
                  initial={{ x: rackDirection === 'next' ? '100%' : '-100%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: rackDirection === 'next' ? '-100%' : '100%', opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="absolute inset-0 flex flex-col items-center justify-center px-2 sm:px-4 pt-2 pb-24 overflow-hidden"
                >
                  <AnimatePresence>
                    {dragState && (
                      <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-indigo-600 text-white px-6 py-2 rounded-full shadow-2xl text-[10px] font-bold uppercase tracking-widest border border-indigo-400 pointer-events-none"
                      >
                        Soltá en un hueco o en un estante abajo
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Rack Header */}
                  <div className="mb-2 sm:mb-3 flex items-center gap-4 shrink-0">
                    <ShelfTitle 
                      title={shelves[currentRack]?.title ?? ''} 
                      onChange={(title) => {
                        const id = shelves[currentRack]?.id;
                        if (id) onUpdateShelfTitle(id, title);
                      }}
                    />
                  </div>

                  {/* Strict 4×4 grid — sized to ~80% of viewport height */}
                  <div
                    className="grid grid-cols-4 grid-rows-4 gap-2.5 sm:gap-3.5 w-full max-w-5xl mx-auto shrink min-h-0"
                    style={{ height: 'min(80vh, calc(100dvh - 9rem))' }}
                  >
                    {shelves[currentRack] && Array.from({ length: 16 }).map((_, idx) => {
                      const bookId = shelves[currentRack].bookIds[idx];
                      const book = bookId ? getBook(bookId) : null;

                      return (
                        <div 
                          key={`slot-${currentRack}-${idx}`}
                          data-shelf-slot
                          data-shelf-id={shelves[currentRack].id}
                          data-slot-index={idx}
                          className={cn(
                            "relative flex flex-col items-center justify-end min-h-0 min-w-0 transition-all duration-300 touch-none",
                            !book && "border-2 border-dashed border-white/5 rounded-lg opacity-10 hover:opacity-30 hover:bg-white/5",
                            dragOverBook?.shelfId === shelves[currentRack].id && dragOverBook?.index === idx && "ring-2 ring-amber-500 bg-amber-500/10 opacity-100 scale-105 z-10"
                          )}
                        >
                          {book ? (
                            <div
                              className={cn(
                                "w-full h-full max-h-full flex flex-col items-center justify-end min-h-0 transition-all",
                                dragState?.bookId === book.id && "opacity-20 grayscale"
                              )}
                              onPointerDown={(e) =>
                                onBookPointerDown(
                                  e,
                                  book.id,
                                  shelves[currentRack].id,
                                  idx,
                                  book.title,
                                  covers[book.filename]
                                )
                              }
                              onClick={(e) => {
                                if (suppressClickRef.current) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }
                              }}
                            >
                              <BookCover 
                                book={book}
                                cover={covers[book.filename]}
                                onClick={() => {
                                  if (!suppressClickRef.current) onOpenBook(book);
                                }}
                                onEdit={() => onEditBook(book)}
                                onShare={() => onShareBook?.(book)}
                                onHover={setHoverColor}
                                readingProgress={onGetProgress?.(book.filename)}
                                isSimplified={isSimplified}
                                isIdentifying={identifyingBookId === book.id}
                                isSavedInDb={savedBookCovers?.[book.filename]}
                                showLabels={showCoverLabels}
                                fillHeight
                              />
                              {!isSimplified && <ShelfLedge compact />}
                            </div>
                          ) : (
                            <div className="w-full flex-1 min-h-[2rem]" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation / Move Targets */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 z-[60] max-w-[94vw]">
              <AnimatePresence mode="wait">
                {dragState ? (
                  <motion.div 
                    initial={{ y: 50, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 50, opacity: 0, scale: 0.9 }}
                    className="flex gap-2 p-2 bg-stone-900/95 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl shadow-black/50 overflow-x-auto max-w-[90vw]"
                  >
                    {shelves.map((shelf) => (
                      <div
                        key={`target-${shelf.id}`}
                        data-rack-target={shelf.id}
                        className={cn(
                          "px-4 py-3 rounded-xl border border-dashed transition-all flex flex-col items-center gap-1 min-w-[100px] shrink-0",
                          dragOverShelf === shelf.id 
                            ? "bg-amber-500/20 border-amber-500 scale-105" 
                            : "bg-black/20 border-white/5 text-stone-400"
                        )}
                      >
                        <Library size={14} className={cn(dragOverShelf === shelf.id ? "text-amber-500 animate-pulse" : "opacity-30")} />
                        <span className="text-[9px] font-black uppercase tracking-tighter">{shelf.title}</span>
                      </div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex flex-wrap items-center justify-center gap-2 bg-stone-950/50 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/5 shadow-xl max-w-[94vw]"
                  >
                    <button
                      onClick={() => flipRack('prev')}
                      disabled={currentRack === 0}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-stone-400 hover:text-white hover:bg-white/10 disabled:opacity-20"
                      aria-label="Estante anterior"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div className="flex gap-1.5 overflow-x-auto max-w-[70vw] py-0.5 scrollbar-thin">
                      {shelves.map((shelf, idx) => {
                        const n = shelf.bookIds.filter(Boolean).length;
                        return (
                          <button
                            key={`chip-${shelf.id}`}
                            onClick={() => goToRack(idx)}
                            className={cn(
                              "shrink-0 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border",
                              currentRack === idx
                                ? "bg-amber-600/90 text-white border-amber-400/40 shadow-lg shadow-amber-950/40"
                                : "bg-black/30 text-stone-400 border-white/5 hover:text-white hover:bg-white/10"
                            )}
                            aria-label={`Ir a ${shelf.title}`}
                          >
                            <span className="max-w-[7rem] truncate inline-block align-bottom">{shelf.title}</span>
                            <span className="ml-1 opacity-60 font-mono">{n}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => flipRack('next')}
                      disabled={currentRack === shelves.length - 1}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-stone-400 hover:text-white hover:bg-white/10 disabled:opacity-20"
                      aria-label="Estante siguiente"
                    >
                      <ChevronRight size={18} />
                    </button>
                    {onAddShelf && (
                      <button
                        onClick={() => { onAddShelf(); setTimeout(() => goToRack(shelves.length), 0); }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-stone-500 hover:text-amber-500 hover:bg-white/10"
                        title="Añadir estante"
                      >
                        <span className="text-sm font-bold leading-none">+</span>
                      </button>
                    )}
                    {onRemoveShelf && shelves.length > 1 && (
                      <button
                        onClick={() => {
                          const id = shelves[currentRack]?.id;
                          if (!id) return;
                          const result = onRemoveShelf(id);
                          if (result && typeof result.destinationIndex === 'number') {
                            goToRack(result.destinationIndex);
                          } else {
                            goToRack(Math.max(0, currentRack - 1));
                          }
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-stone-500 hover:text-red-500 hover:bg-white/10"
                        title="Eliminar estante actual"
                      >
                        <span className="text-sm font-bold leading-none">−</span>
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Desktop edge arrows (also help while dragging) */}
            <div className="absolute inset-y-0 left-0 right-0 pointer-events-none hidden md:flex items-center justify-between px-4 lg:px-12 z-20">
              <div className="w-16 h-full pointer-events-auto flex items-center justify-start">
                <button 
                  onClick={() => flipRack('prev')}
                  disabled={currentRack === 0}
                  className="p-3 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white transition-all disabled:opacity-0"
                >
                  <ChevronLeft size={32} />
                </button>
              </div>
              <div className="w-16 h-full pointer-events-auto flex items-center justify-end">
                <button 
                  onClick={() => flipRack('next')}
                  disabled={currentRack === shelves.length - 1}
                  className="p-3 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white transition-all disabled:opacity-0"
                >
                  <ChevronRight size={32} />
                </button>
              </div>
            </div>

            {/* Drag ghost */}
            {ghost && (
              <div
                className="fixed z-[200] pointer-events-none w-16 sm:w-20 aspect-[2/3] rounded-md shadow-2xl border border-amber-400/50 overflow-hidden opacity-90"
                style={{ left: ghost.x + 8, top: ghost.y + 8 }}
              >
                {ghost.cover && (ghost.cover.startsWith('data:') || ghost.cover.startsWith('http')) ? (
                  <img src={ghost.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-stone-800 text-amber-100 text-[8px] font-bold p-1 flex items-center justify-center text-center">
                    {ghost.title}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Daily Quote Banner */}
      <AnimatePresence>
        {dailyHighlight && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="shrink-0 z-50 px-4 py-3"
          >
            <div className="max-w-3xl mx-auto bg-stone-950/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl px-5 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-serif italic text-stone-300 leading-relaxed line-clamp-3">
                  “{dailyHighlight.text}”
                </p>
                <p className="text-[10px] text-amber-500/80 font-bold uppercase tracking-widest mt-1 truncate">
                  {dailyHighlight.bookTitle}
                </p>
              </div>
              <button
                onClick={() => onDismissHighlight?.()}
                className="text-stone-500 hover:text-white transition-colors p-0.5 shrink-0"
                aria-label="Dismiss quote"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function ShelfLedge({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("relative w-full z-0 pointer-events-none shrink-0", compact ? "h-2 mt-[-2px]" : "h-5 mt-[-6px]")}>
      <div className={cn("absolute inset-x-[-2px] top-0 bg-gradient-to-b from-[#3d2b1f] to-[#2a1d13] rounded-sm shadow-xl border-t border-white/10", compact ? "h-1.5" : "h-3 inset-x-[-4px]")} />
      <div className={cn("absolute inset-x-[-2px] bg-[#1a110b] rounded-b-md shadow-2xl border-t border-black/40", compact ? "top-1.5 h-1" : "top-3 h-2 inset-x-[-4px]")} />
      {!compact && <div className="absolute inset-x-[-6px] top-5 h-6 bg-black/40 blur-lg rounded-full" />}
    </div>
  );
}

function ShelfTitle({ title, onChange }: { title: string; onChange: (title: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const clean = draft.trim();
    if (clean) onChange(clean);
    else setDraft(title);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') {
              setDraft(title);
              setIsEditing(false);
            }
          }}
          autoFocus
          className="bg-black/50 text-amber-200 text-sm font-serif font-bold px-3 py-0.5 rounded-lg border border-amber-500/50 outline-none focus:ring-1 focus:ring-amber-500 w-48 shadow-inner"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(title);
        setIsEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }}
      className="flex items-center gap-2 group/edit transition-all"
    >
      <h2 className="text-sm font-serif font-bold text-amber-100/90 tracking-wide">
        {title}
      </h2>
      <Pencil size={10} className="text-amber-500 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
    </button>
  );
}

