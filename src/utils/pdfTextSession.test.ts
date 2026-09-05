import { beforeEach, describe, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('./pdfRuntime', () => ({ getPdfJsRuntime: async () => runtime }));
import { PdfTextSession } from './pdfTextSession';

beforeEach(() => runtime.getDocument.mockReset());
describe('text PDF lifecycle', () => {
  it('deduplicates current-page and neighbor requests for the same document', async () => {
    const task = { promise: Promise.resolve({ numPages: 400 }), destroy: vi.fn().mockResolvedValue(undefined) };
    runtime.getDocument.mockReturnValue(task);
    const session = new PdfTextSession();
    const first = session.load('/books/a.pdf', 'a.pdf');
    expect(session.load('/books/a.pdf', 'a.pdf')).toBe(first);
    await first;
    expect(runtime.getDocument).toHaveBeenCalledTimes(1);
    expect(runtime.getDocument).toHaveBeenCalledWith(expect.objectContaining({ url: '/books/a.pdf', disableAutoFetch: true }));
    session.reset();
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });
  it('retries after a failed PDF load instead of keeping a rejected promise', async () => {
    runtime.getDocument.mockImplementationOnce(() => ({ promise: Promise.reject(Error('offline')), destroy: vi.fn().mockResolvedValue(undefined) }));
    const session = new PdfTextSession();
    await expect(session.load('/a.pdf', 'a')).rejects.toThrow('offline');
    runtime.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2 }), destroy: vi.fn().mockResolvedValue(undefined) });
    await expect(session.load('/a.pdf', 'a')).resolves.toEqual({ numPages: 2 });
  });
  it('destroys an old book and rejects its late result after switching books', async () => {
    let finish!: (pdf: any) => void;
    const old = { promise: new Promise(resolve => { finish = resolve; }), destroy: vi.fn().mockResolvedValue(undefined) };
    runtime.getDocument.mockReturnValueOnce(old).mockReturnValueOnce({ promise: Promise.resolve({ numPages: 5 }), destroy: vi.fn().mockResolvedValue(undefined) });
    const session = new PdfTextSession();
    const pending = session.load('/old.pdf', 'old');
    const rejected = expect(pending).rejects.toThrow('superseded');
    await Promise.resolve();
    await session.load('/new.pdf', 'new');
    finish({ numPages: 100 });
    await rejected;
    expect(old.destroy).toHaveBeenCalledOnce();
  });
});
