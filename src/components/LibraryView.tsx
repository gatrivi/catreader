import { useState, useRef, useCallback, useEffect } from 'react';
import { Library, Cloud, Upload, Loader2, Pencil, ChevronLeft, ChevronRight, Wand2, ImagePlus, User } from 'lucide-react';
import { BookCover } from './BookCover';
import { authService } from '../services/authService';
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
  isSyncing?: boolean;
  enrichmentProgress?: { current: number; total: number; filename?: string };
  onShareBook?: (book: LibraryBook) => void;
}

const SHELVES_PER_CASE = 2;

const RACKS_PER_PAGE = 4; // 4 rows
const BOOKS_PER_RACK = 4; // 4 columns

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
  isSyncing,
  enrichmentProgress,
  onShareBook
  }: LibraryViewProps) => {

  const [customWallpaper, setCustomWallpaper] = useState<string | null>(
    localStorage.getItem('catreader_custom_wallpaper')
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const pfp = authService.getPFP();
  const svgDataUrl = pfp ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(pfp)))}` : null;

  const wallpapers: Record<string, string> = {
    wood: 'repeating-linear-gradient(to bottom, #2d1d13, #2d1d13 300px, #1a110b 300px, #1a110b 320px)',
    dim: '#1c1917',
    slate: '#0f172a',
    glass: 'conic-gradient(from 0deg at 50% 50%, #4c1d95 0deg, #831843 60deg, #1e3a8a 120deg, #064e3b 180deg, #78350f 240deg, #4c1d95 300deg)'
  };

  // Divide shelves into "Pages" (4 racks per page)
  const pages: Shelf[][] = [];
  for (let i = 0; i < shelves.length; i += RACKS_PER_PAGE) {
    pages.push(shelves.slice(i, i + RACKS_PER_PAGE));
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const idx = Math.round(el.scrollLeft / window.innerWidth);
      setCurrentPage(idx);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
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
      // Optional: reorder in the target shelf after move
      // But moveBook currently appends, so we'd need a more complex moveBook
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
        backgroundSize: wallpaper === 'custom' ? 'cover' : '100% 320px',
        backgroundPosition: 'center'
      }}
    >
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2">
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
              <input type="file" accept=".pdf,.txt" className="hidden" onChange={onFileUpload} />
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
          <div 
            ref={scrollRef}
            className="h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-none items-stretch"
          >
            {pages.map((pageRacks, pageIdx) => (
              <div 
                key={pageIdx} 
                className="w-full min-w-full h-full snap-center flex flex-col p-2 sm:p-4"
              >
                <div className="flex-1 grid grid-rows-4 gap-[2%] h-full">
                  {pageRacks.map((rack) => {
                    const rackBooks = rack.bookIds
                      .map(id => getBook(id))
                      .filter((b): b is LibraryBook => !!b);

                    const isDragOver = dragOverShelf === rack.id;

                    return (
                      <div 
                        key={rack.id}
                        className={cn(
                          "relative flex flex-col justify-end pb-1 px-2 rounded-lg transition-all duration-300",
                          !isSimplified && "bg-black/10 backdrop-blur-[2px] border-b border-white/5",
                          isDragOver && "bg-indigo-500/10 ring-1 ring-indigo-500/50"
                        )}
                        onDragOver={(e) => handleShelfDragOver(e, rack.id)}
                        onDragEnter={(e) => handleShelfDragEnter(e, rack.id)}
                        onDragLeave={handleShelfDragLeave}
                        onDrop={(e) => handleShelfDrop(e, rack.id)}
                      >
                        {/* Rack Info (Hidden or minimal) */}
                        <div className="absolute top-1 left-2 flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity z-10">
                          <ShelfTitle 
                            title={rack.title} 
                            onChange={(title) => onUpdateShelfTitle(rack.id, title)}
                          />
                        </div>

                        {/* Books Grid - 4 columns */}
                        <div className="grid grid-cols-4 gap-2 items-end">
                          {rackBooks.slice(0, 4).map((book, bookIdx) => (
                            <div
                              key={book.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, book.id, rack.id, bookIdx)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                "cursor-grab active:cursor-grabbing transition-all shrink-0 relative",
                                dragState?.bookId === book.id && "opacity-40",
                                dragOverBook?.shelfId === rack.id && dragOverBook?.index === bookIdx && "ring-2 ring-indigo-500 rounded-lg scale-105 z-10"
                              )}
                              onDragOver={(e) => handleBookDragOver(e, rack.id, bookIdx)}
                              onDrop={(e) => handleBookDrop(e, rack.id, bookIdx)}
                            >
                              <BookCover 
                                book={book}
                                cover={covers[book.filename]}
                                onClick={() => onOpenBook(book)}
                                onEdit={() => onEditBook(book)}
                                onShare={() => onShareBook?.(book)}
                                isSimplified={isSimplified}
                              />
                            </div>
                          ))}
                        </div>

                        {/* Grounded Rack Line */}
                        {!isSimplified && (
                          <div className={cn(
                            "h-[3px] w-full rounded-full mt-1 shrink-0 shadow-lg",
                            wallpaper === 'glass' ? "bg-white/20" : "bg-gradient-to-r from-amber-900/40 via-amber-700/40 to-amber-900/40"
                          )} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Page Indicators (Home Screen Style) */}
        {pages.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-30">
            {pages.map((_, idx) => (
              <div 
                key={idx}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300",
                  currentPage === idx ? "bg-white w-4" : "bg-white/20"
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

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
      <div className="flex items-center gap-2 z-10 relative">
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
          className="bg-stone-900/80 text-amber-100 text-xs font-serif font-bold px-2 py-0.5 rounded-lg border border-amber-700/40 outline-none focus:border-amber-500 w-40"
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
      className="flex items-center gap-1.5 z-10 relative group/shelf"
    >
      <h2 className="text-xs font-serif font-bold text-amber-100/80 group-hover/shelf:text-amber-100 transition-colors">
        {title}
      </h2>
      <Pencil size={9} className="text-amber-100/0 group-hover/shelf:text-amber-100/50 transition-colors" />
    </button>
  );
}
