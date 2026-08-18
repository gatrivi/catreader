let runtimePromise: Promise<any> | null = null;

export function getPdfJsRuntime(): Promise<any> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      (pdfjs as any).GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return runtimePromise;
}
