import { useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  Flag,
  Loader2,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import type { LibraryBook } from '../hooks/useLibrary';
import {
  feedLocationLabel,
  paperPageForFeedItem,
  type ReadingFeedItem,
} from '../utils/readingFeed';
import { PaperLayer } from './PaperLayer';
import { usePaperTexture } from '../hooks/usePaperTexture';
import { copyFragmentToClipboard, resolveArtSource } from '../utils/shareCard';

export interface ReadingFeedCardProps {
  item: ReadingFeedItem;
  book: LibraryBook;
  coverSrc?: string;
  shareUrl?: string;
  saved: boolean;
  onOpenItem: (item: ReadingFeedItem, book: LibraryBook) => void;
  onMore: (item: ReadingFeedItem) => void;
  onSkip: (item: ReadingFeedItem) => void;
  onLess: (item: ReadingFeedItem) => void;
  onToggleSaved: (item: ReadingFeedItem) => void;
  onReport: (item: ReadingFeedItem) => void;
  onMessage: (message: string) => void;
}

export function ReadingFeedCard({
  item,
  book,
  coverSrc,
  shareUrl,
  saved,
  onOpenItem,
  onMore,
  onSkip,
  onLess,
  onToggleSaved,
  onReport,
  onMessage,
}: ReadingFeedCardProps) {
  const paperPage = paperPageForFeedItem(item.locator);
  const { manifest, active, grainUrl } = usePaperTexture(book.paper, paperPage, true);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const artSource = resolveArtSource(coverSrc || book.svg);

  const copyFragment = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const mode = await copyFragmentToClipboard({
        item,
        book,
        manifest,
        paperPage,
        coverSrc,
        shareUrl,
      });
      setCopied(true);
      onMessage(mode === 'image-and-text'
        ? 'Arte y párrafo copiados.'
        : 'Párrafo copiado; este navegador no admite arte en el portapapeles.');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      onMessage('No se pudo copiar. Revisá los permisos del navegador.');
    } finally {
      setCopying(false);
    }
  };

  return (
    <article className='feed-paper-article'>
      <div className='feed-paper-card'>
        <PaperLayer active={active} grainUrl={grainUrl} className='z-0' />
        <div className='feed-paper-content'>
          <div className='feed-paper-meta'>
            <span className='feed-paper-source'>
              {artSource ? <img src={artSource} alt='' className='feed-paper-cover' /> : <BookOpen size={13} />}
              <span className='truncate'>{item.title}</span>
            </span>
            <span>{feedLocationLabel(item.locator)}</span>
          </div>
          <p className='feed-paper-quote'>{item.text}</p>
          <div className='feed-paper-footer'>
            <div className='min-w-0'>
              <p className='truncate text-xs font-semibold'>{item.author || 'Autor desconocido'}</p>
              <p className='feed-paper-hint'>Usá Abrir para leer en el libro</p>
            </div>
            <button type='button' className='feed-paper-open' onClick={(event) => { event.stopPropagation(); onOpenItem(item, book); }} aria-label={'Abrir ' + item.title + ' en el libro'}>
              <span>Abrir</span>
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        <div className='feed-paper-actions'>
          <button type='button' onClick={() => onMore(item)} aria-label='Más fragmentos de este libro' title='Ver más fragmentos de este libro'>
            <ThumbsUp size={14} />
            <span>Más así</span>
          </button>
          <button type='button' onClick={() => onSkip(item)} aria-label='Otro fragmento' title='Saltar este fragmento'>
            <SkipForward size={14} />
            <span>Otro</span>
          </button>
          <button type='button' onClick={() => onToggleSaved(item)} aria-label={saved ? 'Quitar de guardados' : 'Guardar fragmento'} aria-pressed={saved} title='Guardar en este dispositivo'>
            {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            <span>{saved ? 'Guardado' : 'Guardar'}</span>
          </button>
          <button type='button' onClick={copyFragment} disabled={copying} aria-label='Copiar arte y párrafo' title='Copiar arte y párrafo'>
            {copying ? <Loader2 size={14} className='animate-spin' /> : copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
          <button type='button' onClick={() => onLess(item)} aria-label='Menos fragmentos de este libro' title='Poner este libro al final del feed'>
            <ThumbsDown size={14} />
            <span>Menos</span>
          </button>
        </div>
        <div className='feed-paper-report'>
          <button type='button' onClick={() => onReport(item)}>
            <Flag size={12} /> Reportar fragmento
          </button>
        </div>
      </div>
    </article>
  );
}
