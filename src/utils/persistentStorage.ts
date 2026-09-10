/** Ask the browser to keep our storage (books, covers, progress) — otherwise it may evict silently. */

import { debugInfo, debugWarn } from './debugLog';

let requested = false;

export async function requestPersistentStorage(): Promise<boolean> {
  if (requested) return false;
  requested = true;
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) {
      debugInfo('storage', 'already persistent');
      return true;
    }
    const granted = await navigator.storage.persist();
    debugInfo('storage', granted ? 'persistent storage granted' : 'persistent storage denied', {});
    return granted;
  } catch (err) {
    debugWarn('storage', 'persist request failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
