import { useState, useEffect, useRef, useCallback } from 'react';
import { coverDB } from '../services/db';

declare var google: any;
declare var gapi: any;

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || 'AIzaSyBvydI7C1p9ErqnIoY4VqFrM9TeBESTWLg';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

interface UseGoogleDriveProps {
  showToast: (msg: string) => void;
  setIsSyncing: (val: boolean) => void;
  setFileUrl: (val: string | null) => void;
  setFileName: (val: string) => void;
  setFileType: (val: string) => void;
  setTextContent: (val: string | null) => void;
  setNumPages: (val: number) => void;
  setIsLoaded: (val: boolean) => void;
  loadProgress: (id: string) => Promise<any>;
}

/**
 * Hook to manage Google Drive integration.
 * Handles script loading, authentication, file picking, and uploading.
 */
export function useGoogleDrive({
  showToast,
  setIsSyncing,
  setFileUrl,
  setFileName,
  setFileType,
  setTextContent,
  setNumPages,
  setIsLoaded,
  loadProgress
}: UseGoogleDriveProps) {
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const gapiLoaded = useRef(false);
  const gisLoaded = useRef(false);

  useEffect(() => {
    const loadScripts = () => {
      // Avoid double loading
      if (document.querySelector('script[src="https://apis.google.com/js/api.js"]')) {
        gapiLoaded.current = true;
      } else {
        const gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.async = true;
        gapiScript.defer = true;
        gapiScript.onload = () => { gapiLoaded.current = true; };
        document.body.appendChild(gapiScript);
      }

      if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
        gisLoaded.current = true;
      } else {
        const gisScript = document.createElement('script');
        gisScript.src = 'https://accounts.google.com/gsi/client';
        gisScript.async = true;
        gisScript.defer = true;
        gisScript.onload = () => { gisLoaded.current = true; };
        document.body.appendChild(gisScript);
      }
    };
    loadScripts();
  }, []);

  const createPicker = useCallback((token: string) => {
    if (typeof gapi === 'undefined') {
      showToast('Google API not ready');
      return;
    }

    gapi.load('picker', () => {
      const view = new google.picker.View(google.picker.ViewId.DOCS);
      view.setMimeTypes('application/pdf,text/plain,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword');
      
      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback(async (data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const file = data.docs[0];
            const fileId = file.id;
            const fileName = file.name;
            const ext = fileName.split('.').pop()?.toLowerCase() || 'pdf';
            
            setIsSyncing(true);
            try {
              // Check cache first
              const cached = await coverDB.getBookContent(fileName);
              let blob: Blob;
              
              if (cached) {
                console.log('Loading from cache:', fileName);
                blob = cached;
              } else {
                console.log('Fetching from Drive:', fileName);
                const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`Drive fetch failed: ${response.status}`);
                blob = await response.blob();
                // Save to cache
                await coverDB.saveBookContent(fileName, blob);
              }

              const url = URL.createObjectURL(blob);
              setFileUrl(url);
              setFileName(fileName);
              setFileType(ext);
              
              if (ext === 'txt') {
                const text = await blob.text();
                setTextContent(text);
                setNumPages(1);
              } else {
                setTextContent(null);
              }
              
              await loadProgress(fileName);
              if (ext === 'txt') setIsLoaded(true);
              else setIsLoaded(false);
            } catch (err) {
              console.error('Error fetching Google Drive file:', err);
              showToast('Error al descargar el archivo de Google Drive.');
            } finally {
              setIsSyncing(false);
            }
          }
        })
        .build();
      picker.setVisible(true);
    });
  }, [setIsSyncing, setFileUrl, setFileName, setFileType, setTextContent, setNumPages, loadProgress, setIsLoaded, showToast]);

  const handleGoogleDrive = useCallback(() => {
    if (!GOOGLE_CLIENT_ID && !(window as any)._GOOGLE_CLIENT_ID) {
      const cid = prompt('Por favor, introduce tu Google Client ID (puedes obtenerlo en Google Cloud Console):');
      if (!cid) return;
      (window as any)._GOOGLE_CLIENT_ID = cid;
    }

    const clientId = GOOGLE_CLIENT_ID || (window as any)._GOOGLE_CLIENT_ID;

    if (typeof google === 'undefined' || !google.accounts) {
      showToast('Las librerías de Google aún se están cargando. Por favor, espera un momento.');
      return;
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
      callback: (response: any) => {
        if (response.access_token) {
          setGoogleToken(response.access_token);
          createPicker(response.access_token);
        }
      },
    });

    if (googleToken) {
      createPicker(googleToken);
    } else {
      tokenClient.requestAccessToken();
    }
  }, [googleToken, createPicker, showToast]);

  const uploadToDrive = useCallback(async (file: File, token: string) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      epub: 'application/epub+zip',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword'
    };

    const metadata = {
      name: file.name,
      mimeType: mimeTypes[ext] || 'application/octet-stream',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    try {
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json();
      console.log('File uploaded to Drive:', data);
      return data.id;
    } catch (err) {
      console.error('Error uploading to Drive:', err);
      return null;
    }
  }, []);

  return {
    googleToken,
    handleGoogleDrive,
    uploadToDrive
  };
}
