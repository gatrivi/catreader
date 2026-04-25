import React from 'react';
import { Library, Cloud, Upload } from 'lucide-react';
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
    wood: 'repeating-linear-gradient(to bottom, #8b5a2b, #8b5a2b 200px, #5c3a21 200px, #5c3a21 220px)',
    dim: '#1c1917',
    slate: '#0f172a'
  };

  return (
    <div 
      className={cn("min-h-full p-8 transition-all", isSimplified ? "bg-stone-900" : "")} 
      style={{ 
        background: !isSimplified ? (wallpapers[wallpaper] || wallpapers.wood) : wallpapers.dim,
        backgroundAttachment: 'fixed'
      }}
    >
      <div className="max-w-7xl mx-auto pt-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-12 bg-stone-900/90 backdrop-blur-sm p-4 rounded-2xl border border-white/10 shadow-xl">
          <div className="flex items-center gap-3">
            <Library className="text-amber-500" size={24} />
            <h1 className="text-xl font-serif font-bold text-white tracking-tight">Mi Biblioteca</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/5 mr-4">
              <button 
                onClick={() => onSetWallpaper('wood')}
                className={cn("w-6 h-6 rounded-lg bg-[#8b5a2b] border border-white/10", wallpaper === 'wood' && "ring-2 ring-amber-500")}
                title="Madera"
              />
              <button 
                onClick={() => onSetWallpaper('dim')}
                className={cn("w-6 h-6 rounded-lg bg-stone-800 border border-white/10", wallpaper === 'dim' && "ring-2 ring-amber-500")}
                title="Dim"
              />
              <button 
                onClick={onToggleSimplified}
                className={cn("px-2 text-[10px] font-bold uppercase text-stone-400 hover:text-white transition-colors", isSimplified && "text-amber-500")}
              >
                {isSimplified ? 'Simple: ON' : 'Simple: OFF'}
              </button>
            </div>

            <button 
              onClick={onGoogleDrive}
              className="flex items-center gap-2 bg-stone-800 text-white hover:bg-stone-700 transition-all px-4 py-2 rounded-xl text-sm font-bold"
            >
              <Cloud size={16} />
              Drive
            </button>
            <label className="flex items-center gap-2 bg-stone-800 text-white hover:bg-stone-700 transition-all px-4 py-2 rounded-xl text-sm font-bold cursor-pointer">
              <Upload size={16} />
              Subir
              <input type="file" accept=".pdf,.txt" className="hidden" onChange={onFileUpload} />
            </label>
          </div>
        </div>

        {library.length === 0 ? (
          <div className="text-center py-20 text-stone-300/80 font-serif">
            <p className="text-xl mb-4">Tu biblioteca está vacía.</p>
            <p className="text-sm">Sube un libro o conecta tu Google Drive para empezar.</p>
          </div>
        ) : (
          <div className={cn(
            "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-12 gap-y-20 w-[95%] mx-auto pb-24 mt-20",
            isSimplified && "gap-x-8 gap-y-12"
          )}>
            {library.map(book => (
              <BookCover 
                key={book.id}
                book={book}
                cover={covers[book.filename]}
                onClick={() => onOpenBook(book)}
                onEdit={() => onEditBook(book)}
                isSimplified={isSimplified}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
