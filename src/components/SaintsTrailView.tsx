import { BookCover } from './BookCover';
import {
  SAINTS_TRAIL,
  resolveTrailBook,
  snakeRows,
  type TrailBook,
} from '../data/saintsTrail';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Props = {
  library: TrailBook[];
  covers: Record<string, string>;
  onOpenBook: (book: TrailBook) => void;
  onEditBook: (book: TrailBook) => void;
  onShareBook?: (book: TrailBook) => void;
  onGetProgress?: (filename: string) => number;
  isSimplified?: boolean;
  identifyingBookId?: string | null;
  savedBookCovers?: Record<string, boolean>;
  showCoverLabels?: boolean;
};

function StubCover({ title, author, yearLabel }: { title: string; author: string; yearLabel: string }) {
  return (
    <div
      className="w-full aspect-[2/3] max-h-full rounded-r-md border border-dashed border-white/15 bg-stone-900/60 flex flex-col items-center justify-center px-2 text-center grayscale opacity-40"
      title={`${title} — aún no en la biblioteca`}
      aria-label={`${title}, no disponible`}
    >
      <span className="text-[9px] uppercase tracking-widest text-stone-500 mb-1">{yearLabel}</span>
      <span className="text-[11px] font-serif text-stone-400 leading-tight">{title}</span>
      <span className="text-[9px] text-stone-600 mt-1 italic">{author}</span>
    </div>
  );
}

/** Chrono snake trail of saints' books — owned live, missing grayed. */
export function SaintsTrailView({
  library,
  covers,
  onOpenBook,
  onEditBook,
  onShareBook,
  onGetProgress,
  isSimplified,
  identifyingBookId,
  savedBookCovers,
  showCoverLabels,
}: Props) {
  const nodes = SAINTS_TRAIL.map((node) => ({
    node,
    book: resolveTrailBook(node, library),
  }));
  const rows = snakeRows(nodes, 3);
  const owned = nodes.filter((n) => n.book).length;

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-6 pt-2 pb-28 overflow-y-auto min-h-0">
      <div className="text-center mb-6 shrink-0">
        <h2 className="text-lg sm:text-xl font-serif text-amber-100/90 tracking-wide">
          Sendero de los Santos
        </h2>
        <p className="text-[10px] text-stone-500 uppercase tracking-[0.2em] mt-1">
          Cronología · {owned}/{nodes.length} en tu biblioteca
        </p>
      </div>

      <div className="relative space-y-8 sm:space-y-10">
        {/* soft spine behind the snake */}
        <div
          className="pointer-events-none absolute left-1/2 top-4 bottom-4 w-px -translate-x-1/2 bg-gradient-to-b from-amber-700/0 via-amber-600/30 to-amber-700/0"
          aria-hidden
        />

        {rows.map((row, ri) => (
          <div key={ri} className="relative">
            <div
              className={cn(
                'grid grid-cols-3 gap-3 sm:gap-5 items-end',
                ri % 2 === 1 && 'direction-rtl'
              )}
              style={ri % 2 === 1 ? { direction: 'rtl' } : undefined}
            >
              {row.map(({ node, book }) => (
                <div
                  key={node.id}
                  className="relative flex flex-col items-center min-w-0"
                  style={{ direction: 'ltr' }}
                >
                  <span className="mb-1.5 text-[9px] font-mono text-amber-600/80 tracking-wider">
                    {node.yearLabel}
                  </span>
                  {book ? (
                    <div className="w-full max-w-[7.5rem] sm:max-w-[9rem]">
                      <BookCover
                        book={book}
                        cover={covers[book.filename]}
                        onClick={() => onOpenBook(book)}
                        onEdit={() => onEditBook(book)}
                        onShare={onShareBook ? () => onShareBook(book) : undefined}
                        readingProgress={onGetProgress?.(book.filename)}
                        isSimplified={isSimplified}
                        isIdentifying={identifyingBookId === book.id}
                        isSavedInDb={savedBookCovers?.[book.filename]}
                        showLabels={showCoverLabels}
                        fillHeight
                      />
                    </div>
                  ) : (
                    <div className="w-full max-w-[7.5rem] sm:max-w-[9rem]">
                      <StubCover
                        title={node.title}
                        author={node.author}
                        yearLabel={node.yearLabel}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* elbow hint between rows */}
            {ri < rows.length - 1 && (
              <div
                className={cn(
                  'absolute -bottom-5 w-8 h-8 border-amber-700/40',
                  ri % 2 === 0
                    ? 'right-4 border-r border-b rounded-br-xl'
                    : 'left-4 border-l border-b rounded-bl-xl'
                )}
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
