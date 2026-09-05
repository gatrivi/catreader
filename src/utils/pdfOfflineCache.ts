/** Fill the offline cache after the reader has had time to become usable. */
export function cachePdfAfterOpening(
  pdf: { getData(): Promise<Uint8Array> },
  save: (blob: Blob) => Promise<unknown>,
): () => void {
  let cancelled = false;
  const timer = setTimeout(() => {
    void pdf.getData().then(async (data) => {
      if (!cancelled) await save(new Blob([new Uint8Array(data)], { type: 'application/pdf' }));
    }).catch(() => { /* Offline caching must never interrupt reading. */ });
  }, 30000);
  return () => { cancelled = true; clearTimeout(timer); };
}
