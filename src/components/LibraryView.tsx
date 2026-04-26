import React from 'react';
import { Library, Cloud, Upload, Loader2 } from 'lucide-react';
import { BookCover } from './BookCover';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
}

export const LibraryView: React.FC<LibraryViewProps> = ({ 
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
  onSetWallpaper
}) => {
  const wallpapers: Record<string, string> = {
    wood: 'repeating-linear-gradient(to bottom, #2d1d13, #2d1d13 300px, #1a110b 300px, #1a110b 320px)',
    dim: '#1c1917',
    slate: '#0f172a'
  };

  // Organize library into 8 shelves
  const shelfCount = 8;
  const shelves = Array.from({ length: shelfCount }, (_, i) => {
    // Distribute books across shelves. If we have few books, they'll be on the top shelves.
    // If we have many, they'll fill up.
    const booksPerShelf = Math.max(6, Math.ceil(library.length / shelfCount));
    return library.slice(i * booksPerShelf, (i + 1) * booksPerShelf);
  });

  return (
    <div 
      className={cn("min-h-full transition-all pb-32", isSimplified ? "bg-stone-900" : "")} 
      style={{ 
        background: !isSimplified ? (wallpapers[wallpaper] || wallpapers.wood) : wallpapers.dim,
        backgroundAttachment: 'fixed',
        backgroundSize: '100% 320px'
      }}
    >
      <div className="max-w-7xl mx-auto pt-10 px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-16 bg-stone-950/80 backdrop-blur-md p-4 rounded-2xl border border-white/5 shadow-2xl">
          <div className="flex items-center gap-3">
            <Library className="text-amber-600" size={24} />
            <div>
              <h1 className="text-xl font-serif font-bold text-white tracking-tight leading-none">Mi Biblioteca</h1>
              <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">Estante de Madera v1.3.1</p>
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
                onClick={onToggleSimplified}
                className={cn("px-2 text-[10px] font-black uppercase text-stone-500 hover:text-white transition-colors", isSimplified && "text-amber-500")}
              >
                {isSimplified ? 'Simple: ON' : 'Simple: OFF'}
              </button>
            </div>

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
            {shelves.map((shelfBooks, idx) => (
              <div key={idx} className="relative pt-4 pb-12 px-4 group">
                {/* Shelf Wood Platter */}
                {!isSimplified && (
                  <div className="absolute bottom-6 left-0 right-0 h-4 bg-gradient-to-b from-[#4a311d] to-[#2d1d13] rounded-sm shadow-[0_10px_20px_rgba(0,0,0,0.5)] border-t border-white/10 z-0" />
                )}
                
                {/* Books Container */}
                <div className={cn(
                  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-4 relative z-10",
                  isSimplified && "gap-x-6 gap-y-6"
                )}>
                  {shelfBooks.map(book => (
                    <BookCover 
                      key={book.id}
                      book={book}
                      cover={covers[book.filename]}
                      onClick={() => onOpenBook(book)}
                      onEdit={() => onEditBook(book)}
                      isSimplified={isSimplified}
                    />
                  ))}
                  
                  {/* Empty space filler for shelf visual consistency if needed */}
                  {shelfBooks.length === 0 && !isSimplified && (
                    <div className="h-40 flex items-center justify-center opacity-10 font-serif italic text-white pointer-events-none col-span-full">
                      Repisa {idx + 1}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

