import { describe, it, expect } from 'vitest';
import { parseSrt, cueAt } from './srt';

const SAMPLE = `1
00:00:01,000 --> 00:00:03,500
Hail Mary,

2
00:00:03,500 --> 00:00:06,000
full of grace.`;

describe('srt', () => {
  it('parses cues with times in seconds', () => {
    const cues = parseSrt(SAMPLE);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 3.5, text: 'Hail Mary,' });
    expect(cues[1].end).toBe(6);
  });

  it('tolerates CRLF and missing indices', () => {
    const cues = parseSrt('00:00:00,000 --> 00:00:02,000\r\nHola\r\n');
    expect(cues[0].text).toBe('Hola');
  });

  it('cueAt finds the active cue and returns null past the end', () => {
    const cues = parseSrt(SAMPLE);
    expect(cueAt(cues, 2)?.text).toBe('Hail Mary,');
    expect(cueAt(cues, 4)?.text).toBe('full of grace.');
    expect(cueAt(cues, 99)).toBeNull();
  });
});
