import { useEffect, useState } from 'react';
import { Clipboard, Download, Trash2, X } from 'lucide-react';
import {
  clearFragmentReports,
  fragmentReportsJson,
  loadFragmentReports,
  REPORT_REASON_LABELS,
  type FragmentReport,
} from '../utils/fragmentReports';

interface FragmentReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FragmentReportsModal({ isOpen, onClose }: FragmentReportsModalProps) {
  const [reports, setReports] = useState<FragmentReport[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReports(loadFragmentReports());
      setMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const json = fragmentReportsJson(reports);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setMessage('JSON copiado.');
    } catch {
      setMessage('No se pudo copiar; descargalo como archivo.');
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `catreader-fragment-reports-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Reporte descargado.');
  };

  const clear = () => {
    if (!window.confirm('¿Borrar todos los reportes guardados en este dispositivo?')) return;
    clearFragmentReports();
    setReports([]);
    setMessage('Reportes borrados de este dispositivo.');
  };

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-5 backdrop-blur-sm"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="fragment-reports-title" className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-stone-950 text-stone-100 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <h2 id="fragment-reports-title" className="font-serif text-xl font-bold">Reportes de fragmentos</h2>
            <p className="mt-1 text-xs text-stone-500">Se guardan sólo en este dispositivo.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar reportes" className="rounded-full p-2 text-stone-500 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </header>

        <div className="max-h-[52vh] overflow-y-auto p-5">
          {reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">Todavía no reportaste fragmentos.</p>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <article key={report.id} className="rounded-2xl border border-white/10 bg-stone-900/70 p-3">
                  <div className="flex justify-between gap-3 text-[10px] uppercase tracking-widest text-stone-500">
                    <span>{REPORT_REASON_LABELS[report.reason]}</span>
                    <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-stone-300">{report.title}</p>
                  <p className="mt-1 line-clamp-3 font-serif text-sm text-stone-400">{report.text}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        {message && <p className="px-5 text-xs text-emerald-400">{message}</p>}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-white/10 p-5">
          <button type="button" onClick={clear} disabled={!reports.length} className="mr-auto flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-stone-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"><Trash2 size={14} /> Borrar</button>
          <button type="button" onClick={copy} disabled={!reports.length} className="flex items-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-stone-200 hover:bg-stone-700 disabled:opacity-30"><Clipboard size={14} /> Copiar JSON</button>
          <button type="button" onClick={download} disabled={!reports.length} className="flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-30"><Download size={14} /> Descargar</button>
        </footer>
      </section>
    </div>
  );
}
