let runtimePromise: Promise<any> | null = null;

export function getPdfJsRuntime(): Promise<any> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import('react-pdf'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([{ pdfjs }, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}
