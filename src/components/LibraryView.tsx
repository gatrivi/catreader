import { useState, useRef, useCallback, useEffect } from 'react';
import { Library, Cloud, Upload, Loader2, Pencil, ChevronLeft, ChevronRight, Wand2, ImagePlus, User, Sparkles, X, Search, Package2 } from 'lucide-react';
import { BookCover } from './BookCover';
import { authService } from '../services/authService';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Shelf } from '../hooks/useShelves';

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
  onToggleSimplified: () => void;
  onSetWallpaper: (w: string) => void;
  shelves: Shelf[];
  onUpdateShelfTitle: (shelfId: string, title: string) => void;
  onMoveBook: (bookId: string, fromShelfId: string, toShelfId: string) => void;
  onReorderBook: (shelfId: string, fromIndex: number, toIndex: number) => void;
  onMagicEnrich?: () => void;
  onProfileClick?: () => void;
  clearProgress?: () => void;
  identifyingBookId?: string | null;
  isSyncing?: boolean;
  enrichmentProgress?: { current: number; total: number; filename?: string };
  onShareBook?: (book: LibraryBook) => void;
  dailyHighlight?: Highlight | null;
  onDismissHighlight?: () => void;
  onConsolidate?: () => void;
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
  onToggleSimplified,
  onSetWallpaper,
  shelves,
  onUpdateShelfTitle,
  onMoveBook,
  onReorderBook,
  onMagicEnrich,
  onProfileClick,
  clearProgress,
  identifyingBookId,
  isSyncing,
  enrichmentProgress,
  onShareBook,
  dailyHighlight,
  onDismissHighlight,
  onConsolidate
  }: LibraryViewProps) => {

  const [customWallpaper, setCustomWallpaper] = useState<string | null>(
    localStorage.getItem('catreader_custom_wallpaper')
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [currentRack, setCurrentRack] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pfp = authService.getPFP();

  const filteredBooks = library.filter(book => 
    book.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    book.author?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    book.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const svgDataUrl = pfp ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(pfp)))}` : null;

  const wallpapers: Record<string, string> = {
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

  const handleCustomWallpaper = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      localStorage.setItem('catreader_custom_wallpaper', dataUrl);
      setCustomWallpaper(dataUrl);
      onSetWallpaper('custom');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [dragState, setDragState] = useState<{
    bookId: string;
    fromShelfId: string;
    fromIndex: number;
  } | null>(null);

  useEffect(() => {
    if (!dailyHighlight) return;
    const timer = setTimeout(() => onDismissHighlight?.(), 8000);
    return () => clearTimeout(timer);
  }, [dailyHighlight, onDismissHighlight]);
  const [dragOverShelf, setDragOverShelf] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const getBook = (id: string) => library.find(b => b.id === id);

  const handleDragStart = (e: React.DragEvent, bookId: string, shelfId: string, index: number) => {
    setDragState({ bookId, fromShelfId: shelfId, fromIndex: index });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', bookId);
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDragOverShelf(null);
    setDragOverBook(null);
    dragCounter.current = 0;
  };

  const [dragOverBook, setDragOverBook] = useState<{ shelfId: string; index: number } | null>(null);

  const handleBookDragOver = (e: React.DragEvent, shelfId: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverBook({ shelfId, index });
  };

  const handleBookDrop = (e: React.DragEvent, toShelfId: string, toIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverBook(null);
    setDragOverShelf(null);
    if (!dragState) return;

    if (dragState.fromShelfId === toShelfId) {
      onReorderBook(toShelfId, dragState.fromIndex, toIndex);
    } else {
      onMoveBook(dragState.bookId, dragState.fromShelfId, toShelfId);
    }
    setDragState(null);
  };

  const handleShelfDragOver = (e: React.DragEvent, shelfId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverShelf(shelfId);
  };

  const handleShelfDragEnter = (e: React.DragEvent, shelfId: string) => {
    e.preventDefault();
    dragCounter.current++;
    setDragOverShelf(shelfId);
  };

  const handleShelfDragLeave = (e: React.DragEvent) => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setDragOverShelf(null);
    }
  };

  const handleShelfDrop = (e: React.DragEvent, toShelfId: string) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOverShelf(null);
    if (!dragState) return;
    onMoveBook(dragState.bookId, dragState.fromShelfId, toShelfId);
    setDragState(null);
  };

  const lastWheelTime = useRef(0);
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flipRack = (dir: 'next' | 'prev') => {
    if (dir === 'next' && currentRack < shelves.length - 1) {
      setCurrentRack(prev => prev + 1);
    } else if (dir === 'prev' && currentRack > 0) {
      setCurrentRack(prev => prev - 1);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (searchQuery) return;
    const now = Date.now();
    if (now - lastWheelTime.current < 800) return; // Cooldown to prevent rapid flipping
    
    if (Math.abs(e.deltaY) > 30) {
      if (e.deltaY > 0) flipRack('next');
      else flipRack('prev');
      lastWheelTime.current = now;
    }
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
        background: bgStyle,
        backgroundAttachment: 'fixed',
        backgroundSize: wallpaper === 'custom' ? 'cover' : 'auto',
        backgroundPosition: 'center'
      }}
      onWheel={handleWheel}
    >
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2 z-50">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-950/80 backdrop-blur-md p-3 rounded-2xl border border-white/5 shadow-2xl max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <button 
              onClick={onProfileClick}
              className="group relative w-10 h-10 rounded-full bg-stone-900 border border-white/10 flex items-center justify-center overflow-hidden transition-all hover:border-amber-500/50 shadow-lg"
              aria-label="Ver Perfil"
            >
              {svgDataUrl ? (
                <img src={svgDataUrl} alt="PFP" className="w-full h-full object-cover" />
              ) : (
                <User size={18} className="text-stone-500 group-hover:text-amber-500 transition-colors" />
              )}
            </button>
            <div>
              <h1 className="text-lg font-serif font-bold text-white tracking-tight leading-none">Mi Biblioteca</h1>
              <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-0.5">CatReader Library</p>
            </div>
          </div>

          <div className="flex-1 max-w-sm relative group mx-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 group-focus-within:text-amber-500 transition-colors" />
            <input 
              ref={searchInputRef}
              type="text"
              placeholder="Buscar libros..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/5 rounded-xl py-2 pl-9 pr-8 text-xs text-white placeholder:text-stone-600 outline-none focus:border-amber-500/50 transition-all shadow-inner"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-500 hover:text-white transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => onSetWallpaper('wood')}
                className={cn("w-5 h-5 rounded-lg bg-[#5c3a21] border border-white/10 transition-transform active:scale-95", wallpaper === 'wood' && "ring-2 ring-amber-600 shadow-lg shadow-amber-900/40")}
                title="Madera"
                aria-label="Madera wallpaper"
              />
              <button 
                onClick={() => onSetWallpaper('dim')}
                className={cn("w-5 h-5 rounded-lg bg-stone-800 border border-white/10 transition-transform active:scale-95", wallpaper === 'dim' && "ring-2 ring-amber-600")}
                title="Dim"
                aria-label="Dim wallpaper"
              />
              <button 
                onClick={() => onSetWallpaper('slate')}
                className={cn("w-5 h-5 rounded-lg bg-slate-900 border border-white/10 transition-transform active:scale-95", wallpaper === 'slate' && "ring-2 ring-amber-600")}
                title="Slate"
                aria-label="Slate wallpaper"
              />
              <button 
                onClick={() => onSetWallpaper('glass')}
                className={cn("w-5 h-5 rounded-lg border border-white/10 transition-transform active:scale-95", wallpaper === 'glass' && "ring-2 ring-amber-600")}
                style={{ background: wallpapers.glass }}
                title="Stained Glass"
                aria-label="Glass wallpaper"
              />
              <label 
                className={cn("w-5 h-5 rounded-lg border border-white/10 transition-transform active:scale-95 flex items-center justify-center cursor-pointer overflow-hidden",
                  wallpaper === 'custom' && "ring-2 ring-amber-600"
                )}
                title="Custom"
                aria-label="Custom wallpaper"
                style={customWallpaper ? { backgroundImage: `url(${customWallpaper})`, backgroundSize: 'cover' } : { background: '#444' }}
              >
                <ImagePlus size={10} className="text-white/70" />
                <input type="file" accept="image/*" className="hidden" onChange={handleCustomWallpaper} />
              </label>
              <button 
                onClick={onToggleSimplified}
                className={cn("px-2 text-[10px] font-black uppercase text-stone-500 hover:text-white transition-colors", isSimplified && "text-amber-500")}
                aria-label="Toggle simplified view"
              >
                {isSimplified ? 'Simple: ON' : 'Simple: OFF'}
              </button>
            </div>

            {onMagicEnrich && (
              <div className="flex items-center gap-2">
                {onConsolidate && (
                  <button 
                    onClick={onConsolidate}
                    className="flex items-center gap-1.5 bg-stone-900 text-stone-400 hover:text-emerald-400 hover:bg-stone-800 transition-all px-3 py-1.5 rounded-xl text-[10px] font-bold border border-white/5"
                    title="Consolidar Biblioteca: Eliminar huecos vacíos y agrupar libros"
                    aria-label="Consolidate library"
                  >
                    <Package2 size={12} />
                    Consolidar
                  </button>
                )}
                {enrichmentProgress && enrichmentProgress.total > 0 && (
                  <div className="flex flex-col items-end mr-1">
                    <span className="text-[9px] font-mono text-indigo-400 font-bold leading-none">
                      {enrichmentProgress.current}/{enrichmentProgress.total}
                    </span>
                    <span className="text-[8px] text-stone-500 truncate max-w-[80px] leading-tight">
                      {enrichmentProgress.filename}
                    </span>
                  </div>
                )}
                <button 
                  onClick={onMagicEnrich}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 bg-indigo-900/60 text-indigo-200 hover:text-white hover:bg-indigo-800 transition-all px-3 py-1.5 rounded-xl text-[10px] font-bold border border-white/5 disabled:opacity-50"
                  title="Enriquecer biblioteca con Gemini AI (títulos, autores y portadas)"
                  aria-label="Magic enrich"
                >
                  <Wand2 size={12} className={cn(isSyncing && "animate-spin")} />
                  {isSyncing ? 'Procesando...' : 'Magic'}
                </button>
              </div>
            )}

            <button 
              onClick={onGoogleDrive}
              className="flex items-center gap-1.5 bg-stone-900 text-stone-400 hover:text-white hover:bg-stone-800 transition-all px-3 py-1.5 rounded-xl text-[10px] font-bold border border-white/5"
              aria-label="Importar desde Google Drive"
            >
              <Cloud size={12} />
              Importar
            </button>
            <label className="flex items-center gap-1.5 bg-amber-700 text-white hover:bg-amber-600 transition-all px-3 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer shadow-lg shadow-amber-950/50" aria-label="Añadir libro">
              <Upload size={12} />
              Añadir
              <input type="file" accept=".pdf,.txt,.epub" className="hidden" onChange={onFileUpload} />
            </label>
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
          <div className="h-full overflow-y-auto scrollbar-thin px-4 sm:px-8 pt-24 pb-20">
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
                          isSimplified={isSimplified}
                          isIdentifying={identifyingBookId === book.id}
                        />
                        {!isSimplified && <ShelfLedge />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
            {/* Carousel Container */}
            <motion.div 
              className="flex w-full h-full cursor-grab active:cursor-grabbing"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                const threshold = 50;
                if (info.offset.x < -threshold && currentRack < shelves.length - 1) {
                  setCurrentRack(prev => prev + 1);
                } else if (info.offset.x > threshold && currentRack > 0) {
                  setCurrentRack(prev => prev - 1);
                }
              }}
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={currentRack}
                  initial={{ x: 300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -300, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="absolute inset-0 flex flex-col items-center justify-center px-4 sm:px-12 pt-28 pb-20"
                >
                  {/* Rack Header */}
                  <div className="mb-8 flex items-center gap-4">
                    <ShelfTitle 
                      title={shelves[currentRack].title} 
                      onChange={(title) => onUpdateShelfTitle(shelves[currentRack].id, title)}
                    />
                  </div>

                  {/* Strict 4x4 Grid */}
                  <div className="grid grid-cols-4 grid-rows-4 gap-x-4 gap-y-4 sm:gap-x-12 sm:gap-y-8 w-full max-w-6xl h-full max-h-[75vh] items-center justify-items-center">
                    {Array.from({ length: 16 }).map((_, idx) => {
                      const bookId = shelves[currentRack].bookIds[idx];
                      const book = bookId ? getBook(bookId) : null;

                      return (
                        <div 
                          key={`slot-${currentRack}-${idx}`}
                          className={cn(
                            "relative w-full h-full flex flex-col items-center justify-center min-h-0 transition-all duration-300",
                            !book && "border-2 border-dashed border-white/5 rounded-2xl opacity-10 hover:opacity-30 hover:bg-white/5",
                            dragOverBook?.shelfId === shelves[currentRack].id && dragOverBook?.index === idx && "ring-2 ring-amber-500 bg-amber-500/10 opacity-100 scale-105 z-10"
                          )}
                          onDragOver={(e) => handleBookDragOver(e, shelves[currentRack].id, idx)}
                          onDrop={(e) => handleBookDrop(e, shelves[currentRack].id, idx)}
                        >
                          {book ? (
                            <div
                              draggable
                              onDragStart={(e) => handleDragStart(e, book.id, shelves[currentRack].id, idx)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                "w-full max-w-[150px] transition-all cursor-grab active:cursor-grabbing",
                                dragState?.bookId === book.id && "opacity-20 grayscale"
                              )}
                            >
                              <BookCover 
                                book={book}
                                cover={covers[book.filename]}
                                onClick={() => onOpenBook(book)}
                                onEdit={() => onEditBook(book)}
                                onShare={() => onShareBook?.(book)}
                                isSimplified={isSimplified}
                                isIdentifying={identifyingBookId === book.id}
                              />
                              {!isSimplified && <ShelfLedge />}
                            </div>
                          ) : (
                            <div className="w-full h-full" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* Breadcrumbs (Pagination Dots) */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 z-30">
              {shelves.map((shelf, idx) => (
                <button
                  key={`dot-${idx}`}
                  onClick={() => setCurrentRack(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (currentRack !== idx && !flipTimeoutRef.current) {
                      flipTimeoutRef.current = setTimeout(() => {
                        setCurrentRack(idx);
                        flipTimeoutRef.current = null;
                      }, 500);
                    }
                  }}
                  onDragLeave={() => {
                    if (flipTimeoutRef.current) {
                      clearTimeout(flipTimeoutRef.current);
                      flipTimeoutRef.current = null;
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragState) onMoveBook(dragState.bookId, dragState.fromShelfId, shelf.id);
                  }}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all p-4 -m-4 flex items-center justify-center", // Larger hit area
                    currentRack === idx 
                      ? "bg-amber-500 w-4 shadow-[0_0_8px_rgba(245,158,11,0.5)]" 
                      : "bg-white/20 hover:bg-white/40"
                  )}
                  aria-label={`Go to rack ${idx + 1}`}
                >
                  <div className={cn("w-2 h-2 rounded-full", currentRack === idx ? "bg-amber-500 w-4" : "bg-white/20")} />
                </button>
              ))}
            </div>

            {/* Navigation Arrows (Desktop) & Drag Edge Zones */}
            <div className="absolute inset-y-0 left-0 right-0 pointer-events-none hidden md:flex items-center justify-between px-4 lg:px-12 z-20">
              <div 
                className="w-20 h-full pointer-events-auto flex items-center justify-start group"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!flipTimeoutRef.current && currentRack > 0) {
                    flipTimeoutRef.current = setTimeout(() => {
                      flipRack('prev');
                      flipTimeoutRef.current = null;
                    }, 600);
                  }
                }}
              >
                <button 
                  onClick={() => flipRack('prev')}
                  disabled={currentRack === 0}
                  className="p-3 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white transition-all disabled:opacity-0"
                >
                  <ChevronLeft size={32} />
                </button>
              </div>
              <div 
                className="w-20 h-full pointer-events-auto flex items-center justify-end group"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!flipTimeoutRef.current && currentRack < shelves.length - 1) {
                    flipTimeoutRef.current = setTimeout(() => {
                      flipRack('next');
                      flipTimeoutRef.current = null;
                    }, 600);
                  }
                }}
              >
                <button 
                  onClick={() => flipRack('next')}
                  disabled={currentRack === shelves.length - 1}
                  className="p-3 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white transition-all disabled:opacity-0"
                >
                  <ChevronRight size={32} />
                </button>
              </div>
            </div>
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

function ShelfLedge() {
  return (
    <div className="relative h-6 w-full mt-[-8px] z-0 pointer-events-none">
      {/* The main plank top surface */}
      <div className="absolute inset-x-[-12px] top-0 h-4 bg-gradient-to-b from-[#3d2b1f] to-[#2a1d13] rounded-sm shadow-xl border-t border-white/10" />
      {/* The plank front edge (depth) */}
      <div className="absolute inset-x-[-12px] top-4 h-3 bg-[#1a110b] rounded-b-md shadow-2xl border-t border-black/40" />
      {/* Decorative shadow under the ledge */}
      <div className="absolute inset-x-[-20px] top-7 h-8 bg-black/40 blur-xl rounded-full" />
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

