export type DebugLevel = 'info' | 'warn' | 'error';

export interface DebugEntry {
  id: string;
  at: string;
  level: DebugLevel;
  scope: string;
  message: string;
  detail?: string;
}

const STORAGE_KEY = 'catreader_debug_log_v1';
const MAX_ENTRIES = 80;
const listeners = new Set<() => void>();
let installed = false;

function safeStringify(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value.slice(0, 1200);
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`.slice(0, 2000);
  }
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, nested) => {
      if (typeof nested === 'object' && nested !== null) {
        if (seen.has(nested)) return '[Circular]';
        seen.add(nested);
      }
      return nested;
    }).slice(0, 2000);
  } catch {
    return String(value).slice(0, 1200);
  }
}

function readEntries(): DebugEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

let entries: DebugEntry[] = readEntries();

function persist() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Diagnostics must never break the app because storage is unavailable/full.
  }
}

function emit(level: DebugLevel, scope: string, message: string, detail?: unknown) {
  const serialized = safeStringify(detail);
  const entry: DebugEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    level,
    scope,
    message,
    ...(serialized ? { detail: serialized } : {}),
  };

  entries = [...entries, entry].slice(-MAX_ENTRIES);
  persist();
  listeners.forEach((listener) => listener());

  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  fn(`[CatReader:${scope}] ${message}`, detail ?? '');
}

export function debugInfo(scope: string, message: string, detail?: unknown) {
  emit('info', scope, message, detail);
}

export function debugWarn(scope: string, message: string, detail?: unknown) {
  emit('warn', scope, message, detail);
}

export function debugError(scope: string, message: string, detail?: unknown) {
  emit('error', scope, message, detail);
}

export function getDebugEntries(): DebugEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

export function clearDebugEntries() {
  entries = [];
  persist();
  listeners.forEach((listener) => listener());
}

export function subscribeDebugEntries(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function installGlobalDebugCapture() {
  if (typeof window === 'undefined' || installed) return () => {};
  installed = true;

  const onError = (event: ErrorEvent) => {
    debugError('window', 'uncaught error', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: safeStringify(event.error),
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    debugError('promise', 'unhandled rejection', safeStringify(event.reason));
  };

  const onOnline = () => debugInfo('network', 'online');
  const onOffline = () => debugWarn('network', 'offline');

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  debugInfo('boot', 'runtime diagnostics installed', {
    href: window.location.href,
    online: navigator.onLine,
    userAgent: navigator.userAgent,
  });

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    installed = false;
  };
}
