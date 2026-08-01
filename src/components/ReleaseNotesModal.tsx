import { useEffect } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { APP_VERSION, RELEASE_NOTES } from '../utils/releaseNotes';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReleaseNotesModal({ isOpen, onClose }: ReleaseNotesModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          data-testid="release-notes-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-stone-950/70 p-5 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-notes-title"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            className="w-full max-w-sm rounded-2xl border border-amber-500/20 bg-stone-950 p-5 text-stone-200 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-amber-400">
                  <Sparkles size={15} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Novedades</span>
                </div>
                <h2 id="release-notes-title" className="text-lg font-semibold text-white">CatReader {APP_VERSION}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar novedades"
                className="rounded-full p-2 text-stone-500 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={17} />
              </button>
            </div>

            <ul className="space-y-3 text-sm leading-relaxed text-stone-300">
              {RELEASE_NOTES.map((note) => (
                <li key={note} className="flex gap-3">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-amber-600"
            >
              Entendido
            </button>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
