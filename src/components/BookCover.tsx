import React from 'react';
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
        
        {/* Book spine effect */}
        {!isSimplified && (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/10"></div>
            <div className="absolute left-1 top-0 bottom-0 w-px bg-white/30"></div>
          </>
        )}
      </div>
      
      {/* Edit Actions */}
      <div className={cn(
        "absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-10",
        isSimplified ? "opacity-100" : "opacity-0 group-hover:opacity-100",
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
          {/* Using a simple icon representation if Lucide is not passed, but we'll import it in parent */}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
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
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </button>
      </div>
    </div>
  );
};
