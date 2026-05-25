import React, { useState, useEffect } from 'react';
import { X, Upload, RefreshCw, Search, Trash2 } from 'lucide-react';
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
  onRegenerateCover: (title: string, author: string, forceAI?: boolean) => void;
  onDelete?: () => void;
  isSyncing: boolean;
}

export const EditModal: React.FC<EditModalProps> = ({ 
  book, 
  onClose, 
  onSave, 
  onUploadCover, 
  onRegenerateCover,
  onDelete,
  isSyncing 
}) => {
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const previewUrlRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (book) {
      setTitle(book.title);
      setAuthor(book.author || '');
    }
  }, [book]);

  useEffect(() => {
    setCoverPreview(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, [book?.filename]);

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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-stone-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Autor</label>
            <input 
              type="text" 
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full bg-stone-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col items-center justify-center gap-2 p-3 bg-stone-800 hover:bg-stone-700 border border-white/5 rounded-xl cursor-pointer transition-all group relative overflow-hidden">
              {coverPreview ? (
                <img src={coverPreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60" />
              ) : (
                <Upload size={18} className="text-stone-400 group-hover:text-indigo-400" />
              )}
              <span className={cn("text-[9px] font-bold uppercase tracking-tighter z-10", coverPreview ? "text-white drop-shadow-md" : "text-stone-500")}>Subir</span>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
                    const url = URL.createObjectURL(file);
                    previewUrlRef.current = url;
                    setCoverPreview(url);
                    onUploadCover(file);
                  }
                  e.target.value = '';
                }}
              />
            </label>
            
            <button 
              onClick={() => onRegenerateCover(title, author, true)}
              className="flex flex-col items-center justify-center gap-2 p-3 bg-stone-800 hover:bg-stone-700 border border-white/5 rounded-xl transition-all group"
            >
              <RefreshCw size={18} className={cn("text-stone-400 group-hover:text-amber-400", isSyncing && "animate-spin")} />
              <span className="text-[9px] font-bold uppercase tracking-tighter text-stone-500">IA Portada</span>
            </button>

            <button 
              onClick={() => onRegenerateCover(title, author, false)}
              className="flex flex-col items-center justify-center gap-2 p-3 bg-stone-800 hover:bg-stone-700 border border-white/5 rounded-xl transition-all group"
            >
              <Search size={18} className={cn("text-stone-400 group-hover:text-emerald-400", isSyncing && "animate-spin")} />
              <span className="text-[9px] font-bold uppercase tracking-tighter text-stone-500">Buscar</span>
            </button>
          </div>

          <button 
            onClick={() => onSave(title.trim(), author.trim())}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all mt-4"
          >
            Guardar Cambios
          </button>

          {onDelete && (
            <button 
              onClick={() => {
                if (confirm('¿Eliminar este libro de tu biblioteca?')) {
                  onDelete();
                }
              }}
              className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-red-500/10 text-red-500 hover:text-red-400 font-bold py-3 rounded-xl border border-red-500/20 transition-all mt-3"
            >
              <Trash2 size={16} />
              Eliminar Libro
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
