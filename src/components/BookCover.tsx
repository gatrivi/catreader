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
  };
  cover?: string;
  onClick: () => void;
  onEdit: () => void;
  isSimplified?: boolean;
}

export const BookCover: React.FC<BookCoverProps> = ({ book, cover, onClick, onEdit, isSimplified }) => {
  return (
    <div className="group relative flex flex-col items-center">
      <div 
        onClick={onClick}
        className={cn(
          "relative w-44 h-64 bg-[#f4ecd8] rounded-r-md border-l-8 border-[#8b5a2b] cursor-pointer flex flex-col transition-all",
          isSimplified ? "shadow-none border-stone-700 bg-stone-800" : "shadow-[10px_10px_25px_rgba(0,0,0,0.7)] hover:-translate-y-6 duration-500 hover:shadow-[15px_15px_35px_rgba(0,0,0,0.8)]"
        )}
      >
        {cover ? (
          <img src={cover} alt={book.title} className="w-full h-full object-cover rounded-r-md" />
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
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/10"></div>
            <div className="absolute left-1 top-0 bottom-0 w-px bg-white/30"></div>
          </>
        )}
      </div>
      
      <div className={cn(
        "absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10",
        "bg-stone-900/90 p-1.5 rounded-lg shadow-xl border border-white/10"
      )}>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-1.5 hover:bg-white/20 rounded text-stone-300 hover:text-white transition-colors"
          title="Editar metadatos"
        >
          <Pencil size={12} />
        </button>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            const url = new URL(window.location.href);
            url.searchParams.set('book', book.filename);
            navigator.clipboard.writeText(url.toString());
            alert('Enlace copiado al portapapeles');
          }}
          className="p-1.5 hover:bg-white/20 rounded text-stone-300 hover:text-white transition-colors"
          title="Compartir"
        >
          <Share2 size={12} />
        </button>
      </div>
    </div>
  );
};
