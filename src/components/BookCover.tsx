import React from 'react';
import { Pencil, Share2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BookCoverProps {
  book: {
    id: string;
    title: string;
    author?: string;
    filename: string;
    type: string;
    svg?: string;
  };
  cover?: string;
  onClick: () => void;
  onEdit: () => void;
  onShare?: () => void;
  isSimplified?: boolean;
}

export const BookCover: React.FC<BookCoverProps> = ({ book, cover, onClick, onEdit, onShare, isSimplified }) => {
  const displayCover = React.useMemo(() => {
    if (!cover) return null;
    // If it's already a URL or Data URL, return it
    if (cover.startsWith('http') || cover.startsWith('data:')) return cover;
    // If it's raw SVG code, convert to Data URL
    if (cover.includes('<svg')) {
      try {
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(cover)))}`;
      } catch (e) {
        console.error('Failed to encode SVG cover:', e);
        return null;
      }
    }
    return cover;
  }, [cover]);

  const svgDataUrl = React.useMemo(() => {
    if (!book.svg || displayCover) return null;
    try {
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(book.svg)))}`;
    } catch (e) {
      console.error('Failed to encode book.svg:', e);
      return null;
    }
  }, [book.svg, displayCover]);

  return (
    <div className="group relative flex flex-col items-center w-full">
      <div 
        onClick={onClick}
        className={cn(
          "relative w-full aspect-[2/3] sm:w-40 sm:h-56 md:w-44 md:h-64 bg-[#f4ecd8] rounded-r-sm sm:rounded-r-md border-l-2 sm:border-l-8 border-[#8b5a2b] cursor-pointer flex flex-col transition-all overflow-hidden",
          isSimplified 
            ? "shadow-none border-stone-700 bg-stone-800" 
            : "shadow-[2px_2px_8px_rgba(0,0,0,0.4)] sm:shadow-[8px_8px_20px_rgba(0,0,0,0.6)] hover:-translate-y-1 sm:hover:-translate-y-2 duration-300 hover:shadow-[4px_4px_12px_rgba(0,0,0,0.5)] sm:hover:shadow-[12px_12px_28px_rgba(0,0,0,0.7)]"
        )}
      >
        {displayCover ? (
          <img src={displayCover} alt={book.title} className="w-full h-full object-cover rounded-r-md" />
        ) : svgDataUrl ? (
          <img src={svgDataUrl} alt={book.title} className="w-full h-full object-cover rounded-r-md" />
        ) : (
          <div className="flex-1 p-3 flex flex-col justify-between text-center overflow-hidden">
            <div className={cn(
              "font-serif font-bold text-sm leading-tight line-clamp-4 mt-2",
              isSimplified ? "text-stone-300" : "text-[#5b4636]"
            )}>
              {book.title}
            </div>
            <div className={cn(
              "font-serif text-[10px] uppercase tracking-widest line-clamp-2 mb-2",
              isSimplified ? "text-stone-500" : "text-[#8b5a2b]"
            )}>
              {book.author || 'Autor Desconocido'}
            </div>
          </div>
        )}
        
        {!isSimplified && (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/10" />
            <div className="absolute left-1 top-0 bottom-0 w-px bg-white/30" />
          </>
        )}

        {/* Action buttons - always visible but subtle */}
        <div className={cn(
          "absolute top-1.5 right-1.5 flex items-center gap-1 z-20",
          "transition-opacity",
          // On touch devices always show; on desktop show on hover
          "opacity-70 md:opacity-0 md:group-hover:opacity-100"
        )}>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors backdrop-blur-sm"
            title="Editar metadatos y portada"
            aria-label="Editar metadatos y portada"
          >
            <Pencil size={10} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (onShare) onShare();
            }}
            className="p-1 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors backdrop-blur-sm"
            title="Compartir"
            aria-label="Compartir"
          >
            <Share2 size={10} />
          </button>
        </div>
      </div>
    </div>
  );
};
