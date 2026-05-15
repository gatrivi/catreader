import React from 'react';
import { Pencil, Share2, Sparkles, AlertCircle, GripVertical } from 'lucide-react';
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
  readingProgress?: number; // 0 to 1
  onClick: () => void;
  onEdit: () => void;
  onShare?: () => void;
  onHover?: (color: string | null) => void;
  isSimplified?: boolean;
  isIdentifying?: boolean;
}

export const BookCover: React.FC<BookCoverProps> = ({ 
  book, 
  cover, 
  readingProgress = 0,
  onClick, 
  onEdit, 
  onShare, 
  onHover,
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

  // Estimate dominant color for aura and hover feedback
  const auraColor = React.useMemo(() => {
    if (readingProgress >= 0.95) return 'rgba(255, 215, 0, 0.4)'; // Golden for finished
    if (readingProgress > 0) return 'rgba(16, 185, 129, 0.3)'; // Emerald for in progress
    return 'rgba(255, 255, 255, 0.1)'; // Faint white for unread
  }, [readingProgress]);

  // Handle hover to report "color mood"
  const handleMouseEnter = () => {
    if (onHover) {
      // In a real app, we might extract this from the image.
      // For the demo, we use a color based on the book title hash.
      const colors = ['#4c1d95', '#831843', '#1e3a8a', '#064e3b', '#78350f', '#1c1917'];
      const hash = book.title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      onHover(colors[hash % colors.length]);
    }
  };

  const handleMouseLeave = () => {
    if (onHover) onHover(null);
  };

  return (
    <div 
      className="group relative flex flex-col items-center w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Reading Aura */}
      {!isSimplified && readingProgress > 0 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ 
            opacity: [0.3, 0.5, 0.3],
            scale: [1, 1.05, 1],
            boxShadow: [
              `0 0 10px ${auraColor}`,
              `0 0 25px ${auraColor}`,
              `0 0 10px ${auraColor}`
            ]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-x-2 -inset-y-2 rounded-xl z-0 pointer-events-none"
        />
      )}

      <motion.div 
        onClick={isSupported ? onClick : undefined}
        layoutId={`book-container-${book.id}`}
        title="Arrastra para mover el libro"
        className={cn(
          "relative w-full aspect-[2/3] sm:w-40 sm:h-56 md:w-44 md:h-64 bg-[#f4ecd8] rounded-r-sm sm:rounded-r-md border-l-2 sm:border-l-8 border-[#8b5a2b] cursor-pointer flex flex-col transition-all overflow-hidden z-10",
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
              {/* Format Badge */}
              <div className={cn(
                "absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter z-30 shadow-sm border backdrop-blur-md",
                book.type.toLowerCase() === 'pdf' && "bg-red-500/20 text-red-200 border-red-500/30",
                book.type.toLowerCase() === 'epub' && "bg-blue-500/20 text-blue-200 border-blue-500/30",
                book.type.toLowerCase() === 'txt' && "bg-emerald-500/20 text-emerald-200 border-emerald-500/30"
              )}>
                {book.type}
              </div>

              {svgDataUrl ? (
                <img src={svgDataUrl} alt={book.title} className="w-full h-full object-cover rounded-r-md" />
              ) : displayCover ? (
                <img src={displayCover} alt={book.title} className="w-full h-full object-cover rounded-r-md" />
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

        {/* Drag Handle indicator */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 bg-black/40 backdrop-blur-sm p-3 rounded-full border border-white/20">
          <GripVertical size={24} className="text-white shadow-xl" />
        </div>
      </motion.div>
    </div>
  );
};
