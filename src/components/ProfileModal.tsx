import React, { useState } from 'react';
import { X, User, Shield, LogOut, Wand2 } from 'lucide-react';
import { authService } from '../services/authService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, pin: string) => void;
  onLogout: () => void;
  onGeneratePFP: () => void;
  isSyncing: boolean;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ 
  isOpen, 
  onClose, 
  onLogin, 
  onLogout,
  onGeneratePFP,
  isSyncing 
}) => {
  const [username, setUsername] = useState(authService.getUsername() || '');
  const [pin, setPin] = useState('');
  const [showLogin, setShowLogin] = useState(!authService.getPortableId());
  const pfp = authService.getPFP();

  if (!isOpen) return null;

  const svgDataUrl = pfp ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(pfp)))}` : null;

  return (
    <div 
      className="fixed inset-0 z-[110] bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-stone-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Background Decorative Gradient */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500" />
        
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-serif font-bold text-white">Mi Perfil</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition-colors"><X size={20}/></button>
        </div>

        {!showLogin ? (
          <div className="space-y-8 text-center">
            <div className="relative inline-block group">
              <div className="w-24 h-24 rounded-full bg-stone-800 border-2 border-white/10 flex items-center justify-center overflow-hidden mx-auto shadow-2xl transition-transform group-hover:scale-105">
                {svgDataUrl ? (
                  <img src={svgDataUrl} alt="PFP" className="w-full h-full object-cover" />
                ) : (
                  <User size={40} className="text-stone-600" />
                )}
              </div>
              <button 
                onClick={onGeneratePFP}
                disabled={isSyncing}
                className="absolute -bottom-1 -right-1 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-500 transition-all disabled:opacity-50"
                title="Generar PFP con IA"
              >
                <Wand2 size={14} className={cn(isSyncing && "animate-spin")} />
              </button>
            </div>

            <div>
              <h4 className="text-2xl font-serif font-bold text-white">@{authService.getUsername()}</h4>
              <p className="text-xs text-stone-500 uppercase tracking-widest mt-1">ID Portátil Activo</p>
            </div>

            <div className="pt-4 border-t border-white/5 space-y-3">
              <button 
                onClick={() => setShowLogin(true)}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm text-stone-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              >
                Cambiar de Cuenta
              </button>
              <button 
                onClick={() => {
                  onLogout();
                  setShowLogin(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/5 rounded-xl transition-all"
              >
                <LogOut size={16} /> Cerrar Sesión
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl mb-2">
              <p className="text-[10px] text-indigo-300 uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
                <Shield size={10} /> Acceso Portátil
              </p>
              <p className="text-[11px] text-stone-400 leading-relaxed">
                Usa cualquier Usuario y PIN para recuperar tus libros y progreso en cualquier dispositivo.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Usuario</label>
              <input 
                type="text" 
                placeholder="Ej: lector_viajero"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-stone-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">PIN (Simple)</label>
              <input 
                type="password" 
                placeholder="Ej: 1234"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full bg-stone-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <button 
              onClick={() => {
                if (username && pin) {
                  onLogin(username, pin);
                  setShowLogin(false);
                }
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all mt-4"
            >
              Cargar mi Biblioteca
            </button>
            
            {authService.getPortableId() && (
              <button 
                onClick={() => setShowLogin(false)}
                className="w-full py-2 text-xs text-stone-500 hover:text-stone-300"
              >
                Cancelar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
