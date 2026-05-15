import { useState, useRef, useCallback, useEffect } from 'react';
import { Library, Cloud, Upload, Loader2, Pencil, ChevronLeft, ChevronRight, Wand2, ImagePlus, User, Sparkles, X, Search } from 'lucide-react';
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
  onDismissHighlight
  }: LibraryViewProps) => {

  const [customWallpaper, setCustomWallpaper] = useState<string | null>(
    localStorage.getItem('catreader_custom_wallpaper')
  );
  const [searchQuery, setSearchQuery] = useState('');
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
      <div className="flex-1 relative overflow-hidden">
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
        ) : (
          <div className="h-full overflow-y-auto scrollbar-thin overflow-x-hidden pb-20">
            {/* Enrichment Progress Bar */}
            <AnimatePresence>
              {enrichmentProgress && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="sticky top-0 left-0 right-0 z-50 px-6 py-4 pointer-events-none"
                >
                  <div className="max-w-xl mx-auto bg-stone-900/90 backdrop-blur-xl border border-indigo-500/30 rounded-2xl shadow-2xl p-4 pointer-events-auto">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                          <Wand2 size={16} className="text-indigo-400 animate-pulse" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Magic Identification</p>
                          <p className="text-xs text-white font-serif truncate max-w-[200px]">{enrichmentProgress.filename}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-mono font-bold text-indigo-400">
                          {Math.round((enrichmentProgress.current / enrichmentProgress.total) * 100)}%
                        </span>
                        {clearProgress && (
                          <button onClick={clearProgress} className="text-stone-500 hover:text-white transition-colors">
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-stone-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(enrichmentProgress.current / enrichmentProgress.total) * 100}%` }}
                        className="h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.5)]"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
              {searchQuery ? (
                <div>
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
              ) : (
                <div className="space-y-16">
                  {shelves.map((shelf) => {
                    const shelfBooks = shelf.bookIds
                      .map(id => getBook(id))
                      .filter((b): b is LibraryBook => !!b);

                    if (shelfBooks.length === 0 && shelf.id !== 'shelf-0') return null;

                    return (
                      <div 
                        key={shelf.id}
                        className={cn(
                          "relative group/shelf pt-8 rounded-3xl transition-all duration-500",
                          dragOverShelf === shelf.id && "bg-indigo-500/10 ring-2 ring-indigo-500/30"
                        )}
                        onDragOver={(e) => handleShelfDragOver(e, shelf.id)}
                        onDragEnter={(e) => handleShelfDragEnter(e, shelf.id)}
                        onDragLeave={handleShelfDragLeave}
                        onDrop={(e) => handleShelfDrop(e, shelf.id)}
                      >
                        {/* Sticky Shelf Title */}
                        <div className="sticky top-0 z-20 flex items-center justify-between mb-10 pointer-events-none">
                          <div className="pointer-events-auto bg-stone-950/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/5 shadow-xl transition-transform group-hover/shelf:scale-105">
                            <ShelfTitle 
                              title={shelf.title} 
                              onChange={(title) => onUpdateShelfTitle(shelf.id, title)}
                            />
                          </div>
                          <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent ml-4" />
                        </div>

                        {/* Responsive Books Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-x-6 gap-y-16 items-end">
                          {shelfBooks.map((book, bookIdx) => (
                            <div
                              key={book.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, book.id, shelf.id, bookIdx)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                "relative flex flex-col group/item cursor-grab active:cursor-grabbing transition-all",
                                dragState?.bookId === book.id && "opacity-20 grayscale",
                                dragOverBook?.shelfId === shelf.id && dragOverBook?.index === bookIdx && "ring-2 ring-amber-500 rounded-lg scale-105 z-10"
                              )}
                              onDragOver={(e) => handleBookDragOver(e, shelf.id, bookIdx)}
                              onDrop={(e) => handleBookDrop(e, shelf.id, bookIdx)}
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
                          ))}

                          {/* Empty shelf placeholder for drop */}
                          {shelfBooks.length === 0 && (
                            <div className="col-span-full h-32 flex items-center justify-center border-2 border-dashed border-white/5 rounded-3xl text-stone-600 font-serif italic">
                              Este estante está esperando su primer libro...
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

