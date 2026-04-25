import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, RefreshCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface EditModalProps {
  book: {
    id: string;
    title: string;
    author?: string;
    filename: string;
    type: string;
  } | null;
  onClose: () => void;
  onSave: (title: string, author: string) => void;
  onUploadCover: (file: File) => void;
  onRegenerateCover: (title: string, author: string) => void;
  isSyncing: boolean;
}

export const EditModal: React.FC<EditModalProps> = ({ 
  book, 
  onClose, 
  onSave, 
  onUploadCover, 
  onRegenerateCover,
  isSyncing 
}) => {
  if (!book) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-stone-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-serif font-bold text-white">Editar Libro</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-white"><X size={20}/></button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Título</label>
            <input 
              type="text" 
              defaultValue={book.title}
              id="edit-title"
              className="w-full bg-stone-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Autor</label>
            <input 
              type="text" 
              defaultValue={book.author || ''}
              id="edit-author"
              className="w-full bg-stone-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col items-center justify-center gap-2 p-4 bg-stone-800 hover:bg-stone-700 border border-white/5 rounded-xl cursor-pointer transition-all group">
              <Upload size={20} className="text-stone-400 group-hover:text-indigo-400" />
              <span className="text-[10px] font-bold uppercase tracking-tighter text-stone-500">Subir Portada</span>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadCover(file);
                }}
              />
            </label>
            
            <button 
              onClick={() => {
                const title = (document.getElementById('edit-title') as HTMLInputElement).value;
                const author = (document.getElementById('edit-author') as HTMLInputElement).value;
                onRegenerateCover(title, author);
              }}
              className="flex flex-col items-center justify-center gap-2 p-4 bg-stone-800 hover:bg-stone-700 border border-white/5 rounded-xl transition-all group"
            >
              <RefreshCw size={20} className={cn("text-stone-400 group-hover:text-amber-400", isSyncing && "animate-spin")} />
              <span className="text-[10px] font-bold uppercase tracking-tighter text-stone-500">IA Regenerar</span>
            </button>
          </div>

          <button 
            onClick={() => {
              const title = (document.getElementById('edit-title') as HTMLInputElement).value;
              const author = (document.getElementById('edit-author') as HTMLInputElement).value;
              onSave(title, author);
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all mt-4"
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
};
