import { describe, expect, it } from 'vitest';
import { makeReaderPreviewHtml, previewPlainText } from './readerPreview';

describe('readerPreview', () => {
  it('turns reader HTML into compact readable text', () => {
    const text = previewPlainText('<p>Hello <strong>reader</strong>.</p><p>Second page line.</p>');
    expect(text).toBe('Hello reader.\n\nSecond page line.');
  });

  it('escapes source markup before rendering the preview', () => {
    const html = makeReaderPreviewHtml('<p>One &amp; two</p><script>alert("x")</script>', 0);
    expect(html).toContain('One &amp; two');
    expect(html).not.toContain('<script>');
  });

  it('keeps long previews bounded and can sample later text', () => {
    const source = `${'START '.repeat(1600)}${'END '.repeat(1600)}`;
    const first = makeReaderPreviewHtml(source, 0);
    const last = makeReaderPreviewHtml(source, 1);

    expect(first.length).toBeLessThan(7600);
    expect(last.length).toBeLessThan(7600);
    expect(first).toContain('START');
    expect(last).toContain('END');
  });
});
