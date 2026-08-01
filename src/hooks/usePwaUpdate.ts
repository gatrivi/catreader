import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export type PwaUpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'unavailable' | 'error';

export function usePwaUpdate() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [status, setStatus] = useState<PwaUpdateStatus>('idle');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setStatus('unavailable');
      return;
    }

    registerSW({
      immediate: true,
      onRegisteredSW: (_scriptUrl, registration) => {
        if (registration) registrationRef.current = registration;
      },
      onNeedReload: () => window.location.reload(),
      onRegisterError: (error) => {
        console.error('[PWA] Service worker registration failed:', error);
        setStatus('error');
      },
    });
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      setStatus('unavailable');
      return;
    }

    setStatus('checking');

    try {
      const registration = registrationRef.current ?? await navigator.serviceWorker.getRegistration();
      if (!registration) {
        setStatus('unavailable');
        return;
      }

      await registration.update();
      setStatus('up-to-date');
    } catch (error) {
      console.error('[PWA] Update check failed:', error);
      setStatus('error');
    }
  }, []);

  return { status, checkForUpdate };
}
