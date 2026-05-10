import React from 'react';
import { Pencil, Share2, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SadMonkIcon } from './SadMonkIcon';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SUPPORTED_TYPES = ['pdf', 'txt', 'epub'];

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
  isIdentifying?: boolean;
}

export const BookCover: React.FC<BookCoverProps> = ({ 
  book, 
  cover, 
  onClick, 
  onEdit, 
  onShare, 
  isSimplified,
  isIdentifying 
}) => {
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

  const isSupported = SUPPORTED_TYPES.includes(book.type.toLowerCase());

  return (
    <div className="group relative flex flex-col items-center w-full">
      <motion.div 
        onClick={isSupported ? onClick : undefined}
        layoutId={`book-container-${book.id}`}
        className={cn(
          "relative w-full aspect-[2/3] sm:w-40 sm:h-56 md:w-44 md:h-64 bg-[#f4ecd8] rounded-r-sm sm:rounded-r-md border-l-2 sm:border-l-8 border-[#8b5a2b] cursor-pointer flex flex-col transition-all overflow-hidden",
          isSimplified 
            ? "shadow-none border-stone-700 bg-stone-800" 
            : "shadow-[2px_2px_8px_rgba(0,0,0,0.4)] sm:shadow-[8px_8px_20px_rgba(0,0,0,0.6)] hover:-translate-y-1 sm:hover:-translate-y-2 duration-300 hover:shadow-[4px_4px_12px_rgba(0,0,0,0.5)] sm:hover:shadow-[12px_12px_28px_rgba(0,0,0,0.7)]",
          isIdentifying && "ring-4 ring-amber-500 ring-offset-2 ring-offset-stone-900 animate-pulse",
          !isSupported && "cursor-not-allowed filter grayscale contrast-75 brightness-75"
        )}
      >
        <AnimatePresence mode="wait">
          {isIdentifying ? (
            <motion.div
              key="identifying"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 bg-gradient-to-br from-amber-600/40 via-stone-900/80 to-indigo-900/40 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center"
            >
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  rotate: [0, 10, -10, 0],
                  filter: ["drop-shadow(0 0 0px #f59e0b)", "drop-shadow(0 0 15px #f59e0b)", "drop-shadow(0 0 0px #f59e0b)"]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="text-amber-400 mb-2" size={32} />
              </motion.div>
              <div className="text-[10px] font-serif italic text-amber-200 uppercase tracking-widest animate-pulse">
                Identificando...
              </div>
              
              {/* Magic Runes Effect */}
              <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
                <div className="absolute top-2 left-2 text-[8px] font-mono text-amber-300 rotate-12 italic">Ω Ψ Φ</div>
                <div className="absolute bottom-4 right-2 text-[8px] font-mono text-indigo-300 -rotate-12 italic">Δ Σ Ξ</div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full flex flex-col relative"
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

              {/* Sad Monk Overlay for Unsupported Books */}
              {!isSupported && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-stone-900/40 backdrop-blur-[2px]">
                  <SadMonkIcon size={48} className="text-amber-500" />
                  <div className="mt-2 px-2 py-0.5 bg-amber-600 text-white text-[8px] font-black uppercase tracking-tighter rounded-full shadow-lg">
                    Formato no soportado
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        
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
      </motion.div>
    </div>
  );
};
