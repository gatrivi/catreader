import type { CattsLang } from '../services/catts';

/** TTS lang from library filename markers (`_EN.pdf`, `_ES.pdf`). */
export function detectBookLang(filename: string): CattsLang {
  const f = filename || '';
  if (/_ES(?:_|\.|$)/i.test(f)) return 'es';
  if (/_EN(?:_|\.|$)/i.test(f)) return 'en';
  if (/\.es\./i.test(f)) return 'es';
  if (/\.en\./i.test(f)) return 'en';
  return 'es';
}
