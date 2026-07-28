import { describe, it, expect } from 'vitest';
import {
  SAINTS_TRAIL,
  resolveTrailBook,
  snakeRows,
} from './saintsTrail';

const lib = [
  {
    id: 'a',
    filename: '0360-0435,_Cassianus,_The_Conferences_Of_John_Cassian,_EN.pdf',
    title: 'Conferences',
    type: 'pdf',
  },
  {
    id: 'b',
    filename: 'The_Cloud_of_Unknowing-Unknown.pdf',
    title: 'Cloud pdf',
    type: 'pdf',
  },
  {
    id: 'c',
    filename: 'The_Cloud_of_Unknowing-Unknown.epub',
    title: 'Cloud epub',
    type: 'epub',
  },
];

describe('saintsTrail', () => {
  it('has owned + stub nodes', () => {
    expect(SAINTS_TRAIL.some((n) => n.stub)).toBe(true);
    expect(SAINTS_TRAIL.some((n) => n.match && !n.stub)).toBe(true);
  });

  it('resolves Cassian from library', () => {
    const node = SAINTS_TRAIL.find((n) => n.id === 'cassian')!;
    expect(resolveTrailBook(node, lib)?.filename).toContain('Cassian');
  });

  it('prefers epub when both match', () => {
    const node = SAINTS_TRAIL.find((n) => n.id === 'cloud')!;
    expect(resolveTrailBook(node, lib)?.type).toBe('epub');
  });

  it('stubs resolve null', () => {
    const node = SAINTS_TRAIL.find((n) => n.id === 'augustine')!;
    expect(resolveTrailBook(node, lib)).toBeNull();
  });

  it('snakeRows zigzags', () => {
    expect(snakeRows([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 2, 3],
      [6, 5, 4],
    ]);
  });
});
