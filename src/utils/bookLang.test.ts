import { describe, expect, it } from 'vitest';
import { detectBookLang } from './bookLang';

describe('detectBookLang', () => {
  it('reads _EN / _ES markers', () => {
    expect(
      detectBookLang('0360-0435,_Cassianus,_The_Conferences_Of_John_Cassian,_EN.pdf')
    ).toBe('en');
    expect(detectBookLang('algun_libro_ES.pdf')).toBe('es');
  });
});
