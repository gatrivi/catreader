import React from 'react';
import { X, Clipboard, RefreshCw, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  clearDebugEntries,
  debugInfo,
  getDebugEntries,
  subscribeDebugEntries,
  type DebugEntry,
} from '../utils/debugLog';
import {
  runCriticalSelfTest,
  summarizeCovers,
  type HealthCheckResult,
  type RuntimeBookLike,
} from '../utils/healthCheck';

interface DiagnosticsPanelProps {
  open: boolean;
  onClose: () => void;
  appVersion: string;
  device: string;
  library: RuntimeBookLike[];
  covers: Record<string, string>;
  coversHydrated: boolean;
  libraryLoading: boolean;
  activeBook: string;
  fileType: string;
  readerMode: boolean;
  isLoaded: boolean;
  isRestoring: boolean;
  pageNumber: number;
  numPages: number;
  pwaStatus?: string;
  isSyncing: boolean;
}

function statusClass(status: HealthCheckResult['status']) {
  if (status === 'pass') return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
  if (status === 'fail') return 'text-red-300 border-red-500/30 bg-red-500/10';
  return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
}

function statusGlyph(status: HealthCheckResult['status']) {
  return status === 'pass' ? '✓' : status === 'fail' ? '✕' : '!';
}

function copyTextFallback(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  open,
  onClose,
  appVersion,
  device,
  library,
  covers,
  coversHydrated,
  libraryLoading,
  activeBook,
  fileType,
  readerMode,
  isLoaded,
  isRestoring,
  pageNumber,
  numPages,
  pwaStatus,
  isSyncing,
}) => {
  const [checks, setChecks] = React.useState<HealthCheckResult[]>([]);
  const [running, setRunning] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [entries, setEntries] = React.useState<DebugEntry[]>(() => getDebugEntries());
  const coverStats = React.useMemo(() => summarizeCovers(library, covers), [library, covers]);

  React.useEffect(() => subscribeDebugEntries(() => setEntries(getDebugEntries())), []);

  const runChecks = React.useCallback(async () => {
    setRunning(true);
    try {
      const next = await runCriticalSelfTest();
      setChecks(next);
      debugInfo('health', 'critical self-test complete', next);
    } catch (error) {
      const failure: HealthCheckResult = {
        id: 'self-test',
        label: 'Self-test',
        status: 'fail',
        detail: error instanceof Error ? error.message : String(error),
      };
      setChecks([failure]);
    } finally {
      setRunning(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void runChecks();
  }, [open, runChecks]);

  const overall: HealthCheckResult['status'] = checks.some((check) => check.status === 'fail')
    ? 'fail'
    : checks.some((check) => check.status === 'warn')
      ? 'warn'
      : checks.length
        ? 'pass'
        : 'warn';

  const report = React.useMemo(() => JSON.stringify({
    generatedAt: new Date().toISOString(),
    version: appVersion,
    href: typeof window !== 'undefined' ? window.location.href : '',
    device,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    state: {
      libraryBooks: library.length,
      libraryLoading,
      coversHydrated,
      covers: coverStats,
      activeBook: activeBook || null,
      fileType,
      readerMode,
      isLoaded,
      isRestoring,
      page: `${pageNumber}/${numPages || 0}`,
      pwaStatus: pwaStatus || null,
      isSyncing,
    },
    checks,
    recentLog: entries.slice(-40),
  }, null, 2), [
    activeBook,
    appVersion,
    checks,
    coverStats,
    coversHydrated,
    device,
    entries,
    fileType,
    isLoaded,
    isRestoring,
    isSyncing,
    library.length,
    libraryLoading,
    numPages,
    pageNumber,
    pwaStatus,
    readerMode,
  ]);

  const copyReport = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(report);
      else copyTextFallback(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      copyTextFallback(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const clearLog = () => {
    clearDebugEntries();
    setEntries([]);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[220] bg-stone-950/98 text-stone-200 overflow-auto overscroll-contain"
        >
          <div className="max-w-4xl mx-auto px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-8 font-mono text-xs sm:text-sm">
            <div className="sticky top-0 z-10 -mx-3 px-3 py-3 sm:mx-0 sm:px-0 bg-stone-950/95 backdrop-blur border-b border-white/10 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${overall === 'pass' ? 'bg-emerald-500' : overall === 'fail' ? 'bg-red-500' : 'bg-amber-500'}`} />
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-white text-sm sm:text-base">CatReader diagnóstico</h2>
                <p className="text-[10px] text-stone-500 truncate">v{appVersion} · tocá “Copiar” y pegalo en el chat si algo falla</p>
              </div>
              <button onClick={onClose} className="min-w-11 min-h-11 grid place-items-center rounded-xl bg-white/5 border border-white/10" aria-label="Cerrar diagnóstico">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 my-3">
              <button onClick={() => void runChecks()} disabled={running} className="min-h-12 rounded-xl bg-indigo-500/15 border border-indigo-400/25 text-indigo-200 flex items-center justify-center gap-1.5 disabled:opacity-50">
                <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
                <span>{running ? 'Testeando' : 'Test'}</span>
              </button>
              <button onClick={() => void copyReport()} className="min-h-12 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-200 flex items-center justify-center gap-1.5">
                <Clipboard size={14} />
                <span>{copied ? 'Copiado ✓' : 'Copiar'}</span>
              </button>
              <button onClick={clearLog} className="min-h-12 rounded-xl bg-white/5 border border-white/10 text-stone-400 flex items-center justify-center gap-1.5">
                <Trash2 size={14} />
                <span>Log</span>
              </button>
            </div>

            <section className="mb-3 rounded-xl border border-white/10 bg-stone-900/50 p-3">
              <h3 className="text-stone-500 uppercase tracking-wider font-bold mb-2">Estado ahora</h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div>Biblioteca</div><div className="text-right text-white">{library.length} {libraryLoading ? '(cargando)' : ''}</div>
                <div>Portadas</div><div className="text-right text-white">{coverStats.real} reales · {coverStats.custom} custom</div>
                <div>Sin portada</div><div className={`text-right ${coverStats.missing ? 'text-amber-300' : 'text-emerald-300'}`}>{coverStats.missing}</div>
                <div>Sintéticas</div><div className="text-right text-stone-400">{coverStats.synthetic}</div>
                <div>Libro</div><div className="text-right text-indigo-300 truncate">{activeBook || 'ninguno'}</div>
                <div>Lector</div><div className="text-right text-white">{fileType} · {readerMode ? 'texto' : 'original'} · {isLoaded ? 'loaded' : 'loading'}</div>
                <div>Página</div><div className="text-right text-white">{pageNumber}/{numPages || 0}{isRestoring ? ' · restoring' : ''}</div>
                <div>PWA</div><div className="text-right text-white">{pwaStatus || 'n/a'} · {isSyncing ? 'syncing' : 'idle'}</div>
              </div>
            </section>

            <section className="mb-3 rounded-xl border border-white/10 bg-stone-900/50 p-3">
              <h3 className="text-stone-500 uppercase tracking-wider font-bold mb-2">Critical self-test</h3>
              {checks.length === 0 ? (
                <p className="text-stone-500">Sin resultados todavía.</p>
              ) : (
                <div className="space-y-2">
                  {checks.map((check) => (
                    <div key={check.id} className={`rounded-lg border p-2 ${statusClass(check.status)}`}>
                      <div className="flex gap-2 items-start">
                        <span className="font-black">{statusGlyph(check.status)}</span>
                        <div className="min-w-0">
                          <div className="font-bold">{check.label}</div>
                          <div className="opacity-80 break-words text-[10px] sm:text-xs">{check.detail}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-stone-500 uppercase tracking-wider font-bold">Últimos eventos</h3>
                <span className="text-stone-600">{entries.length}/80</span>
              </div>
              <div className="space-y-1.5 max-h-[38vh] overflow-auto">
                {entries.length === 0 ? <p className="text-stone-600">Sin eventos.</p> : entries.slice(-40).reverse().map((entry) => (
                  <div key={entry.id} className="border-b border-white/5 pb-1.5 break-words">
                    <div className="flex gap-2">
                      <span className={entry.level === 'error' ? 'text-red-400' : entry.level === 'warn' ? 'text-amber-400' : 'text-emerald-500'}>{entry.level.toUpperCase()}</span>
                      <span className="text-indigo-300">{entry.scope}</span>
                      <span className="text-stone-300">{entry.message}</span>
                    </div>
                    {entry.detail && <pre className="mt-1 whitespace-pre-wrap text-[9px] sm:text-[10px] text-stone-600">{entry.detail}</pre>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
