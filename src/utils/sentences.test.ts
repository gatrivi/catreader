import { describe, it, expect } from 'vitest';
import {
  htmlToPlain,
  splitSentences,
  startIndexFromSelection,
  chunkForLive,
  sentencesFromPageHtml,
  hashText,
} from './sentences';

describe('sentences', () => {
  it('strips html', () => {
    expect(htmlToPlain('<p>Hola <b>mundo</b>.</p>')).toBe('Hola mundo.');
  });

  it('splits sentences', () => {
    const s = splitSentences('Uno. Dos! Tres? Fin.');
    expect(s).toEqual(['Uno.', 'Dos!', 'Tres?', 'Fin.']);
  });

  it('starts from selected sentence', () => {
    const s = ['Primera frase.', 'Segunda aquí.', 'Tercera.'];
    expect(startIndexFromSelection(s, 'Segunda aquí')).toBe(1);
    expect(startIndexFromSelection(s, '')).toBe(0);
    expect(startIndexFromSelection(s, 'no match')).toBe(0);
  });

  it('chunks long text for /tts/live', () => {
    const long = Array.from({ length: 100 }, (_, i) => `palabra${i}`).join(' ');
    const chunks = chunkForLive(long, 500, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 500)).toBe(true);
    expect(chunks.every((c) => c.split(/\s+/).length <= 80)).toBe(true);
  });

  it('slices page from selection', () => {
    const html = '<p>A. B. C.</p>';
    expect(sentencesFromPageHtml(html, 'B.')).toEqual(['B.', 'C.']);
    expect(sentencesFromPageHtml(html, null)).toEqual(['A.', 'B.', 'C.']);
  });

  it('strips running book title/author before TTS', () => {
    const html =
      '<p>The Conferences of John Ca by John Cassian When I was in the desert of Scete.</p>';
    const out = sentencesFromPageHtml(html, null, {
      title: 'The Conferences of John Cassian',
      author: 'John Cassian',
    });
    expect(out.join(' ')).not.toMatch(/Conferences of John/i);
    expect(out.join(' ')).toMatch(/desert of Scete/i);
  });

  it('hashes stably', () => {
    expect(hashText('hola')).toBe(hashText('hola'));
    expect(hashText('hola')).not.toBe(hashText('adios'));
  });
});
