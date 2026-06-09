import React from 'react';
import { Pencil, Share2, Sparkles, AlertCircle, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SadMonkIcon } from './SadMonkIcon';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Prefer enriched title; never show raw filename on the spine when we can help it. */
export function displayBookTitle(title: string, filename: string): string {
  const stripped = filename.replace(/\.[^/.]+$/, '');
  if (title && title !== filename && title !== stripped) return title;
  return stripped
    .replace(/[-_]+/g, ' ')
    .replace(/,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
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
    coverSource?: {
      type: 'user-custom' | 'ai-generated' | 'openlibrary';
    };
  };
  cover?: string;
  readingProgress?: number; // 0 to 1
  onClick: () => void;
  onEdit: () => void;
  onShare?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onHover?: (color: string | null) => void;
  isSimplified?: boolean;
  isIdentifying?: boolean;
  isSavedInDb?: boolean;
  showLabels?: boolean;
  /** Fit cover height inside a fixed grid cell (library rack) */
  fillHeight?: boolean;
}

export const BookCover: React.FC<BookCoverProps> = ({ 
  book, 
  cover, 
  readingProgress = 0,
  onClick, 
  onEdit, 
  onShare,
  onDragStart,
  onDragEnd,
  onHover,
  isSimplified,
  isIdentifying,
  isSavedInDb,
  showLabels,
  fillHeight = false
}) => {
  React.useEffect(() => {
    console.log(`[BookCover] Mount/update ${book.filename}: cover=${!!cover} source=${cover?.startsWith('data:') ? 'dataURL' : cover?.startsWith('http') ? 'url' : cover ? 'svg/other' : 'none'}`);
  }, [book.filename, cover]);
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

  const spineTitle = displayBookTitle(book.title, book.filename);
  const hasMetadata = spineTitle !== book.filename.replace(/\.[^/.]+$/, '') && !!book.author;

  return (
    <div 
      className={cn(
        "group relative flex flex-col items-center w-full min-h-0",
        fillHeight && "h-full justify-end"
      )}
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
        title="Arrastra para mover el libro"
        className={cn(
          "relative bg-[#f4ecd8] rounded-r-sm sm:rounded-r-md border-l-2 sm:border-l-4 lg:border-l-[6px] border-[#8b5a2b] cursor-pointer flex flex-col transition-all overflow-hidden z-10",
          fillHeight ? "h-full max-h-full w-auto aspect-[2/3]" : "w-full aspect-[2/3]",
          isSimplified 
            ? "shadow-none border-stone-700 bg-stone-800" 
            : "shadow-[2px_2px_8px_rgba(0,0,0,0.4)] sm:shadow-[8px_8px_20px_rgba(0,0,0,0.6)] hover:-translate-y-1 sm:hover:-translate-y-2 duration-300 hover:shadow-[4px_4px_12px_rgba(0,0,0,0.5)] sm:hover:shadow-[12px_12px_28px_rgba(0,0,0,0.7)]",
          isIdentifying && "ring-4 ring-amber-500 ring-offset-2 ring-offset-stone-900 animate-pulse",
          isSavedInDb && "ring-4 ring-emerald-500/80 ring-offset-2 ring-offset-stone-900 shadow-[0_0_20px_rgba(16,185,129,0.6)] animate-pulse",
          !isSupported && "cursor-not-allowed filter grayscale contrast-75 brightness-75",
          !hasMetadata && !isSimplified && "ring-1 ring-dashed ring-amber-500/40"
        )}
      >
        {!hasMetadata && !isSimplified && (
          <div className="absolute top-1 left-1 z-30 w-2 h-2 bg-amber-500 rounded-full animate-pulse" title="Falta título o autor" />
        )}

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

              {displayCover ? (
                <img src={displayCover} alt={book.title} className="w-full h-full object-cover rounded-r-md" />
              ) : svgDataUrl && book.coverSource?.type !== 'user-custom' ? (
                <img src={svgDataUrl} alt={book.title} className="w-full h-full object-cover rounded-r-md" />
              ) : (
                <div className="flex-1 p-3 flex flex-col justify-between text-center overflow-hidden">
                  <div className={cn(
                    "font-serif font-bold text-sm leading-tight line-clamp-4 mt-2 break-words",
                    isSimplified ? "text-stone-300" : "text-[#5b4636]"
                  )}>
                    {spineTitle}
                  </div>
                  <div className={cn(
                    "font-serif text-[10px] uppercase tracking-widest line-clamp-2 mb-2 break-words",
                    isSimplified ? "text-stone-500" : "text-[#8b5a2b]"
                  )}>
                    {book.author || 'Autor Desconocido'}
                  </div>
                </div>
              )}

              {/* Title always visible on the spine (even when cover art loads) */}
              {(displayCover || svgDataUrl) && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2 pt-6 pb-1.5 z-30 pointer-events-none">
                  <p className="text-white text-[9px] sm:text-[10px] font-bold leading-tight line-clamp-2 text-center drop-shadow-md">
                    {spineTitle}
                  </p>
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

        {/* Title/Author Label Overlay */}
        {showLabels && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6 z-30 pointer-events-none">
            <p className="text-white text-[9px] font-bold truncate leading-tight">{spineTitle}</p>
            {book.author && book.author !== 'Desconocido' && (
              <p className="text-white/70 text-[7px] truncate leading-tight">{book.author}</p>
            )}
          </div>
        )}

        {/* Action buttons - discreet bottom-right pill */}
        <div className={cn(
          "absolute bottom-2 right-2 flex items-center gap-1.5 z-40 bg-black/60 backdrop-blur-md px-2 py-1 rounded-full border border-white/20 shadow-xl transition-all duration-300 transform",
          "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 translate-y-2 group-hover:translate-y-0"
        )}>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="text-white/80 hover:text-amber-400 transition-colors"
            title="Editar"
          >
            <Pencil size={12} />
          </button>
          <div className="w-px h-3 bg-white/20 mx-0.5" />
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (onShare) onShare();
            }}
            className="text-white/80 hover:text-amber-400 transition-colors"
            title="Compartir"
          >
            <Share2 size={12} />
          </button>
        </div>

        {/* Drag handle — only this element starts a shelf drag (keeps tap-to-open working) */}
        {onDragStart && (
          <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20 bg-black/40 backdrop-blur-sm p-2 rounded-full border border-white/20 cursor-grab active:cursor-grabbing"
            title="Arrastra para mover"
          >
            <GripVertical size={20} className="text-white shadow-xl" />
          </div>
        )}
      </motion.div>
    </div>
  );
};
