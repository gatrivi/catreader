import React, { useEffect, useRef, useState } from 'react';
import ePub, { Rendition } from 'epubjs';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface EpubViewProps {
  fileUrl: string;
  theme: string;
  initialLocation?: string | number;
  onLocationChange?: (cfi: string) => void;
  onTocLoaded?: (toc: any) => void;
}

export const EpubView: React.FC<EpubViewProps> = ({ 
  fileUrl, 
  theme, 
  initialLocation,
  onLocationChange,
  onTocLoaded 
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewerRef.current) return;

    const book = ePub(fileUrl);
    bookRef.current = book;

    const rendition = book.renderTo(viewerRef.current, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      manager: 'default',
    });

    renditionRef.current = rendition;

    const displayPromise = initialLocation 
      ? rendition.display(initialLocation.toString()) 
      : rendition.display();

    displayPromise.then(() => {
      setLoading(false);
      applyTheme();
    });

    book.loaded.navigation.then((nav) => {
      if (onTocLoaded) onTocLoaded(nav.toc);
    });

    rendition.on('relocated', (location: any) => {
      if (onLocationChange) onLocationChange(location.start.cfi);
    });

    // Handle internal links
    rendition.on('linkClicked', (href: string) => {
      rendition.display(href);
    });

    return () => {
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
    };
  }, [fileUrl]);

  const applyTheme = () => {
    if (!renditionRef.current) return;
    
    const themeStyles: any = {
      body: {
        background: 'transparent !important',
        color: theme === 'dark' ? '#d1d5db' : theme === 'sepia' ? '#433422' : '#1c1917',
        'font-family': 'serif !important',
        'font-size': '18px !important',
        'line-height': '1.6 !important'
      }
    };

    renditionRef.current.themes.register('custom', themeStyles);
    renditionRef.current.themes.select('custom');
  };

  useEffect(() => {
    applyTheme();
  }, [theme]);

  const next = () => renditionRef.current?.next();
  const prev = () => renditionRef.current?.prev();

  return (
    <div className="relative w-full h-full flex flex-col bg-transparent">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="animate-spin text-amber-600" size={48} />
        </div>
      )}
      
      <div ref={viewerRef} className="flex-1 w-full max-w-4xl mx-auto" />
      
      {/* EPUB Navigation Controls Overlay */}
      {!loading && (
        <div className="absolute inset-y-0 left-0 right-0 pointer-events-none flex justify-between items-center px-4">
          <button 
            onClick={prev}
            className="pointer-events-auto p-4 rounded-full bg-stone-900/10 hover:bg-stone-900/30 text-stone-500/50 hover:text-stone-700 transition-all"
          >
            <ChevronLeft size={32} />
          </button>
          <button 
            onClick={next}
            className="pointer-events-auto p-4 rounded-full bg-stone-900/10 hover:bg-stone-900/30 text-stone-500/50 hover:text-stone-700 transition-all"
          >
            <ChevronRight size={32} />
          </button>
        </div>
      )}
    </div>
  );
};
