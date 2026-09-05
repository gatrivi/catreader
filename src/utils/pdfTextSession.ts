import { getPdfJsRuntime } from './pdfRuntime';
import { PDF_LOAD_OPTIONS } from './pdfSource';

/** One text-extraction document per open book; failures are retryable. */
export class PdfTextSession {
  private generation = 0;
  private filename = '';
  private pending: Promise<any> | null = null;
  private task: any = null;

  reset() {
    this.generation += 1;
    this.filename = '';
    this.pending = null;
    const task = this.task;
    this.task = null;
    if (task) void task.destroy().catch(() => {});
  }

  load(source: Blob | string, filename: string): Promise<any> {
    if (this.filename === filename && this.pending) return this.pending;
    this.reset();
    this.filename = filename;
    const generation = this.generation;
    const pending = (async () => {
      const runtime = await getPdfJsRuntime();
      const input = typeof source === 'string'
        ? { url: source }
        : { data: new Uint8Array(await source.arrayBuffer()) };
      if (generation !== this.generation) throw new Error('PDF session superseded');
      const task = runtime.getDocument({ ...input, ...PDF_LOAD_OPTIONS, useSystemFonts: true });
      this.task = task;
      const pdf = await task.promise;
      if (generation !== this.generation) throw new Error('PDF session superseded');
      return pdf;
    })().catch((error) => {
      if (generation === this.generation) this.reset();
      throw error;
    });
    this.pending = pending;
    return pending;
  }
}
