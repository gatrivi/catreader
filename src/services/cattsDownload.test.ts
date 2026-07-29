import { describe, expect, it } from 'vitest';
import { cattsBaseUrl } from './catts';

describe('catts audiobook download URL', () => {
  it('builds download path under base', () => {
    const id = 'KEEP_Entering_Jhana';
    const url = `${cattsBaseUrl()}/books/${encodeURIComponent(id)}/download`;
    expect(url).toMatch(/\/books\/KEEP_Entering_Jhana\/download$/);
  });
});
