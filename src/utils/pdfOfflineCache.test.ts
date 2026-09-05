import { afterEach, expect, it, vi } from 'vitest';
import { cachePdfAfterOpening } from './pdfOfflineCache';
afterEach(() => vi.useRealTimers());
it('does not compete with opening, then saves the full PDF for offline use', async () => {
  vi.useFakeTimers();
  const pdf = { getData: vi.fn().mockResolvedValue(new Uint8Array([37,80,68,70,45])) };
  const save = vi.fn().mockResolvedValue(undefined);
  cachePdfAfterOpening(pdf, save);
  await vi.advanceTimersByTimeAsync(29999);
  expect(pdf.getData).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/pdf', size: 5 }));
});
it('cancels the deferred full download on close or mode switch', async () => {
  vi.useFakeTimers();
  const pdf = { getData: vi.fn() };
  const cancel = cachePdfAfterOpening(pdf, vi.fn());
  cancel();
  await vi.advanceTimersByTimeAsync(30000);
  expect(pdf.getData).not.toHaveBeenCalled();
});
