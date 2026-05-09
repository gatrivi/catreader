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
  enrichmentProgress?: { current: number; total: number; filename?: string };
  onShareBook?: (book: LibraryBook) => void;
}

const SHELVES_PER_CASE = 2;

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
  isSyncing,
  enrichmentProgress,
  onShareBook
  }: LibraryViewProps) => {

  const [customWallpaper, setCustomWallpaper] = useState<string | null>(
    localStorage.getItem('catreader_custom_wallpaper')
  );

  const wallpapers: Record<string, string> = {
    wood: 'repeating-linear-gradient(to bottom, #2d1d13, #2d1d13 300px, #1a110b 300px, #1a110b 320px)',
    dim: '#1c1917',
    slate: '#0f172a',
    glass: 'conic-gradient(from 0deg at 50% 50%, #4c1d95 0deg, #831843 60deg, #1e3a8a 120deg, #064e3b 180deg, #78350f 240deg, #4c1d95 300deg)'
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
      <div className="flex-1 relative overflow-y-auto scrollbar-none px-4 py-6">
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
          <div className="max-w-7xl mx-auto space-y-6 sm:space-y-12">
            {shelves.map((shelf) => {
              const shelfBooks = shelf.bookIds
                .map(id => getBook(id))
                .filter((b): b is LibraryBook => !!b);

              const isEmpty = shelfBooks.length === 0;
              const isDragOver = dragOverShelf === shelf.id;

              if (isEmpty && !isDragOver) return null; // Hide empty shelves unless dragging over

              return (
                <div 
                  key={shelf.id}
                  className={cn(
                    "relative flex flex-col gap-2 sm:gap-4 p-2 sm:p-4 rounded-xl sm:rounded-2xl transition-all duration-300",
                    !isSimplified && "bg-black/30 backdrop-blur-md border border-white/5 shadow-2xl",
                    isDragOver && "ring-2 ring-indigo-500 bg-indigo-500/10"
                  )}
                  onDragOver={(e) => handleShelfDragOver(e, shelf.id)}
                  onDragEnter={(e) => handleShelfDragEnter(e, shelf.id)}
                  onDragLeave={handleShelfDragLeave}
                  onDrop={(e) => handleShelfDrop(e, shelf.id)}
                >
                  {/* Shelf Title */}
                  <div className="flex items-center justify-between mb-1">
                    <ShelfTitle 
                      title={shelf.title} 
                      onChange={(title) => onUpdateShelfTitle(shelf.id, title)}
                    />
                    <span className="text-[8px] sm:text-[10px] font-mono text-white/30 uppercase tracking-tighter">
                      {shelfBooks.length} libros
                    </span>
                  </div>

                  {/* Books Grid/Row */}
                  <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-2 sm:gap-6 items-end justify-start">
                    {shelfBooks.map((book, bookIdx) => (
                      <div
                        key={book.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, book.id, shelf.id, bookIdx)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "cursor-grab active:cursor-grabbing transition-all shrink-0 relative",
                          dragState?.bookId === book.id && "opacity-40",
                          dragOverBook?.shelfId === shelf.id && dragOverBook?.index === bookIdx && "ring-2 ring-indigo-500 rounded-lg scale-105 z-10"
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
                        />
                      </div>
                    ))}
                    
                    {isEmpty && (
                      <div className="h-20 sm:h-32 flex items-center justify-center opacity-10 font-serif italic text-white pointer-events-none w-full grid-cols-subgrid col-span-4">
                        Vacío
                      </div>
                    )}
                  </div>

                  {/* Wood Plank or Glass divider */}
                  {!isSimplified && (
                    <div className={cn(
                      "h-1 rounded-full mt-1 shrink-0 shadow-lg",
                      wallpaper === 'glass' ? "bg-white/10" : "bg-gradient-to-r from-amber-900/50 via-amber-700/50 to-amber-900/50"
                    )} />
                  )}
                </div>
              );
            })}
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
