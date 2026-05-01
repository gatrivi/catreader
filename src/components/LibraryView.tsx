import { useState, useRef, useCallback, useEffect } from 'react';
import { Library, Cloud, Upload, Loader2, Pencil, ChevronLeft, ChevronRight, Wand2, ImagePlus } from 'lucide-react';
import { BookCover } from './BookCover';
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
  isSyncing?: boolean;
}

const SHELVES_PER_CASE = 2;

function groupIntoCases(shelves: Shelf[]): Shelf[][] {
  const cases: Shelf[][] = [];
  for (let i = 0; i < shelves.length; i += SHELVES_PER_CASE) {
    cases.push(shelves.slice(i, i + SHELVES_PER_CASE));
  }
  return cases;
}

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
  onMagicEnrich,
  isSyncing
}: LibraryViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeCase, setActiveCase] = useState(0);
  const [customWallpaper, setCustomWallpaper] = useState<string | null>(
    localStorage.getItem('catreader_custom_wallpaper')
  );

  const wallpapers: Record<string, string> = {
    wood: 'repeating-linear-gradient(to bottom, #2d1d13, #2d1d13 300px, #1a110b 300px, #1a110b 320px)',
    dim: '#1c1917',
    slate: '#0f172a'
  };

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

  const cases = groupIntoCases(shelves);

  // Track active case from scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const scrollLeft = el.scrollLeft;
      const caseWidth = el.scrollWidth / cases.length;
      const idx = Math.round(scrollLeft / caseWidth);
      setActiveCase(Math.min(Math.max(0, idx), cases.length - 1));
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [cases.length]);

  const scrollToCase = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const caseEls = el.querySelectorAll<HTMLElement>('[data-bookcase]');
    const target = caseEls[index];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, []);

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
    dragCounter.current = 0;
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
            <Library className="text-amber-600" size={20} />
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
              />
              <button 
                onClick={() => onSetWallpaper('dim')}
                className={cn("w-5 h-5 rounded-lg bg-stone-800 border border-white/10 transition-transform active:scale-95", wallpaper === 'dim' && "ring-2 ring-amber-600")}
                title="Dim"
              />
              <button 
                onClick={() => onSetWallpaper('slate')}
                className={cn("w-5 h-5 rounded-lg bg-slate-900 border border-white/10 transition-transform active:scale-95", wallpaper === 'slate' && "ring-2 ring-amber-600")}
                title="Slate"
              />
              <label 
                className={cn("w-5 h-5 rounded-lg border border-white/10 transition-transform active:scale-95 flex items-center justify-center cursor-pointer overflow-hidden",
                  wallpaper === 'custom' && "ring-2 ring-amber-600"
                )}
                title="Custom"
                style={customWallpaper ? { backgroundImage: `url(${customWallpaper})`, backgroundSize: 'cover' } : { background: '#444' }}
              >
                <ImagePlus size={10} className="text-white/70" />
                <input type="file" accept="image/*" className="hidden" onChange={handleCustomWallpaper} />
              </label>
              <button 
                onClick={onToggleSimplified}
                className={cn("px-2 text-[10px] font-black uppercase text-stone-500 hover:text-white transition-colors", isSimplified && "text-amber-500")}
              >
                {isSimplified ? 'Simple: ON' : 'Simple: OFF'}
              </button>
            </div>

            {onMagicEnrich && (
              <button 
                onClick={onMagicEnrich}
                disabled={isSyncing}
                className="flex items-center gap-1.5 bg-indigo-900/60 text-indigo-200 hover:text-white hover:bg-indigo-800 transition-all px-3 py-1.5 rounded-xl text-[10px] font-bold border border-white/5 disabled:opacity-50"
                title="Free AI magic: enrich titles/authors/covers using Open Library"
              >
                <Wand2 size={12} className={cn(isSyncing && "animate-spin")} />
                {isSyncing ? 'Working...' : 'Magic'}
              </button>
            )}

            <button 
              onClick={onGoogleDrive}
              className="flex items-center gap-1.5 bg-stone-900 text-stone-400 hover:text-white hover:bg-stone-800 transition-all px-3 py-1.5 rounded-xl text-[10px] font-bold border border-white/5"
            >
              <Cloud size={12} />
              Importar
            </button>
            <label className="flex items-center gap-1.5 bg-amber-700 text-white hover:bg-amber-600 transition-all px-3 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer shadow-lg shadow-amber-950/50">
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
            <p className="font-serif italic tracking-wide">Preparando tu estantería...</p>
          </div>
        ) : library.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-16 bg-black/20 backdrop-blur-sm rounded-3xl border border-white/5 max-w-2xl mx-auto shadow-2xl px-8">
              <div className="w-20 h-20 bg-stone-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10">
                <Library size={32} className="text-stone-700" />
              </div>
              <h2 className="text-2xl font-serif text-white mb-2">Tu biblioteca está vacía</h2>
              <p className="text-stone-400 text-sm max-w-xs mx-auto leading-relaxed">
                Sube tus libros en formato PDF o TXT para verlos aquí. La sincronización en la nube se activará automáticamente.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Horizontal Bookcase Scroll */}
            <div 
              ref={scrollRef}
              className="h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-none items-stretch"
            >
              {cases.map((caseShelves, caseIdx) => (
                <div 
                  key={caseIdx}
                  data-bookcase={caseIdx}
                  className="w-[90vw] min-w-[90vw] h-full snap-center flex flex-col px-4 py-2"
                >
                  {/* Bookcase frame */}
                  <div className={cn(
                    "flex-1 flex flex-col gap-4 rounded-2xl p-4 sm:p-6",
                    !isSimplified && "bg-black/20 backdrop-blur-sm border border-white/5 shadow-2xl"
                  )}>
                    {caseShelves.map((shelf) => {
                      const shelfBooks = shelf.bookIds
                        .map(id => getBook(id))
                        .filter((b): b is LibraryBook => !!b);

                      const isEmpty = shelfBooks.length === 0;
                      const isDragOver = dragOverShelf === shelf.id;

                      return (
                        <div 
                          key={shelf.id}
                          className={cn(
                            "flex-1 flex flex-col min-h-0 relative rounded-lg transition-colors",
                            isDragOver && !isSimplified && "bg-amber-900/20 ring-1 ring-amber-600/40"
                          )}
                          onDragOver={(e) => handleShelfDragOver(e, shelf.id)}
                          onDragEnter={(e) => handleShelfDragEnter(e, shelf.id)}
                          onDragLeave={handleShelfDragLeave}
                          onDrop={(e) => handleShelfDrop(e, shelf.id)}
                        >
                          {/* Shelf Title */}
                          <div className="shrink-0 mb-1">
                            <ShelfTitle 
                              title={shelf.title} 
                              onChange={(title) => onUpdateShelfTitle(shelf.id, title)}
                            />
                          </div>

                          {/* Books Row */}
                          <div className="flex-1 flex items-end overflow-x-auto scrollbar-none px-1 pb-0 min-h-0">
                            <div className="flex items-end gap-3">
                              {shelfBooks.map((book, bookIdx) => (
                                <div
                                  key={book.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, book.id, shelf.id, bookIdx)}
                                  onDragEnd={handleDragEnd}
                                  className={cn(
                                    "cursor-grab active:cursor-grabbing transition-opacity shrink-0",
                                    dragState?.bookId === book.id && "opacity-40"
                                  )}
                                >
                                  <BookCover 
                                    book={book}
                                    cover={covers[book.filename]}
                                    onClick={() => onOpenBook(book)}
                                    onEdit={() => onEditBook(book)}
                                    isSimplified={isSimplified}
                                  />
                                </div>
                              ))}
                              
                              {/* Empty shelf placeholder */}
                              {isEmpty && !isSimplified && (
                                <div className="h-32 flex items-center justify-center opacity-10 font-serif italic text-white pointer-events-none shrink-0 w-full">
                                  Arrastra libros aquí
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Wood Plank */}
                          {!isSimplified && (
                            <div className="h-3 bg-gradient-to-b from-[#4a311d] to-[#2d1d13] rounded-sm shadow-[0_6px_12px_rgba(0,0,0,0.5)] border-t border-white/10 mt-1 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Navigation Arrows */}
            {cases.length > 1 && (
              <>
                <button
                  onClick={() => scrollToCase(Math.max(0, activeCase - 1))}
                  disabled={activeCase === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-stone-950/60 text-white/70 hover:bg-stone-950/80 hover:text-white disabled:opacity-0 transition-all backdrop-blur-sm border border-white/5"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => scrollToCase(Math.min(cases.length - 1, activeCase + 1))}
                  disabled={activeCase === cases.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-stone-950/60 text-white/70 hover:bg-stone-950/80 hover:text-white disabled:opacity-0 transition-all backdrop-blur-sm border border-white/5"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}

            {/* Case Indicators */}
            {cases.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                {cases.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => scrollToCase(idx)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      idx === activeCase 
                        ? "bg-amber-500 w-6" 
                        : "bg-white/20 hover:bg-white/40"
                    )}
                  />
                ))}
              </div>
            )}
          </>
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
