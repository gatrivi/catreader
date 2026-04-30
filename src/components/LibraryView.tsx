import { useState, useRef } from 'react';
import { Library, Cloud, Upload, Loader2, Pencil, GripVertical, Wand2, ImagePlus } from 'lucide-react';
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
  isSyncing
}: LibraryViewProps) => {
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
    // Reset input so the same file can be selected again
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
    // Hide the default drag image for a cleaner look
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

  return (
    <div 
      className={cn("min-h-full transition-all pb-32", isSimplified ? "bg-stone-900" : "")} 
      style={{ 
        background: !isSimplified 
          ? (wallpaper === 'custom' && customWallpaper 
              ? `url(${customWallpaper})` 
              : (wallpapers[wallpaper] || wallpapers.wood))
          : wallpapers.dim,
        backgroundAttachment: 'fixed',
        backgroundSize: wallpaper === 'custom' ? 'cover' : '100% 320px',
        backgroundPosition: 'center'
      }}
    >
      <div className="max-w-7xl mx-auto pt-10 px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-16 bg-stone-950/80 backdrop-blur-md p-4 rounded-2xl border border-white/5 shadow-2xl">
          <div className="flex items-center gap-3">
            <Library className="text-amber-600" size={24} />
            <div>
              <h1 className="text-xl font-serif font-bold text-white tracking-tight leading-none">Mi Biblioteca</h1>
              <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">CatReader Library</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 mr-4">
              <button 
                onClick={() => onSetWallpaper('wood')}
                className={cn("w-6 h-6 rounded-lg bg-[#5c3a21] border border-white/10 transition-transform active:scale-95", wallpaper === 'wood' && "ring-2 ring-amber-600 shadow-lg shadow-amber-900/40")}
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
              <label 
                className={cn("w-6 h-6 rounded-lg border border-white/10 transition-transform active:scale-95 flex items-center justify-center cursor-pointer overflow-hidden",
                  wallpaper === 'custom' && "ring-2 ring-amber-600"
                )}
                title="Custom"
                style={customWallpaper ? { backgroundImage: `url(${customWallpaper})`, backgroundSize: 'cover' } : { background: '#444' }}
              >
                <ImagePlus size={12} className="text-white/70" />
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
                className="flex items-center gap-2 bg-indigo-900/60 text-indigo-200 hover:text-white hover:bg-indigo-800 transition-all px-4 py-2 rounded-xl text-xs font-bold border border-white/5 disabled:opacity-50"
                title="Free AI magic: enrich titles/authors/covers using Open Library"
              >
                <Wand2 size={14} className={cn(isSyncing && "animate-spin")} />
                {isSyncing ? 'Working...' : 'Magic'}
              </button>
            )}

            <button 
              onClick={onGoogleDrive}
              className="flex items-center gap-2 bg-stone-900 text-stone-400 hover:text-white hover:bg-stone-800 transition-all px-4 py-2 rounded-xl text-xs font-bold border border-white/5"
            >
              <Cloud size={14} />
              Importar
            </button>
            <label className="flex items-center gap-2 bg-amber-700 text-white hover:bg-amber-600 transition-all px-4 py-2 rounded-xl text-xs font-bold cursor-pointer shadow-lg shadow-amber-950/50">
              <Upload size={14} />
              Añadir
              <input type="file" accept=".pdf,.txt" className="hidden" onChange={onFileUpload} />
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-40 text-stone-400 gap-4">
            <Loader2 className="animate-spin text-amber-600" size={32} />
            <p className="font-serif italic tracking-wide">Preparando tu estantería...</p>
          </div>
        ) : library.length === 0 ? (
          <div className="text-center py-32 bg-black/20 backdrop-blur-sm rounded-3xl border border-white/5 max-w-2xl mx-auto shadow-2xl">
            <div className="w-20 h-20 bg-stone-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10">
              <Library size={32} className="text-stone-700" />
            </div>
            <h2 className="text-2xl font-serif text-white mb-2">Tu biblioteca está vacía</h2>
            <p className="text-stone-400 text-sm max-w-xs mx-auto leading-relaxed">
              Sube tus libros en formato PDF o TXT para verlos aquí. La sincronización en la nube se activará automáticamente.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {shelves.map((shelf, idx) => {
              const shelfBooks = shelf.bookIds
                .map(id => getBook(id))
                .filter((b): b is LibraryBook => !!b);

              const isEmpty = shelfBooks.length === 0;
              const isDragOver = dragOverShelf === shelf.id;

              return (
                <div 
                  key={shelf.id}
                  className={cn(
                    "relative pt-4 pb-12 px-4 group rounded-xl transition-colors",
                    isDragOver && !isSimplified && "bg-amber-900/20 ring-1 ring-amber-600/40"
                  )}
                  onDragOver={(e) => handleShelfDragOver(e, shelf.id)}
                  onDragEnter={(e) => handleShelfDragEnter(e, shelf.id)}
                  onDragLeave={handleShelfDragLeave}
                  onDrop={(e) => handleShelfDrop(e, shelf.id)}
                >
                  {/* Shelf Title */}
                  <ShelfTitle 
                    title={shelf.title} 
                    onChange={(title) => onUpdateShelfTitle(shelf.id, title)}
                  />

                  {/* Shelf Wood Platter */}
                  {!isSimplified && (
                    <div className="absolute bottom-6 left-0 right-0 h-4 bg-gradient-to-b from-[#4a311d] to-[#2d1d13] rounded-sm shadow-[0_10px_20px_rgba(0,0,0,0.5)] border-t border-white/10 z-0" />
                  )}
                  
                  {/* Books Container */}
                  <div className={cn(
                    "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-4 relative z-10 min-h-[120px]",
                    isSimplified && "gap-x-6 gap-y-6"
                  )}>
                    {shelfBooks.map((book, bookIdx) => (
                      <div
                        key={book.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, book.id, shelf.id, bookIdx)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "cursor-grab active:cursor-grabbing transition-opacity",
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
                      <div className="h-40 flex items-center justify-center opacity-10 font-serif italic text-white pointer-events-none col-span-full">
                        Arrastra libros aquí
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
      <div className="flex items-center gap-2 mb-3 z-10 relative">
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
          className="bg-stone-900/80 text-amber-100 text-sm font-serif font-bold px-3 py-1 rounded-lg border border-amber-700/40 outline-none focus:border-amber-500 w-48"
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
      className="flex items-center gap-2 mb-3 z-10 relative group/shelf"
    >
      <h2 className="text-sm font-serif font-bold text-amber-100/80 group-hover/shelf:text-amber-100 transition-colors">
        {title}
      </h2>
      <Pencil size={10} className="text-amber-100/0 group-hover/shelf:text-amber-100/50 transition-colors" />
    </button>
  );
}
