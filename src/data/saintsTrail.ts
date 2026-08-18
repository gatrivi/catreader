/** Chrono saints trail — snake shelf mode. Match library by filename substring. */

export type SaintsTrailNode = {
  id: string;
  year: number;
  yearLabel: string;
  title: string;
  author: string;
  /** filename substring(s); omit + stub = always missing */
  match?: string | string[];
  /** gray placeholder until we have the book */
  stub?: boolean;
};

export const SAINTS_TRAIL: SaintsTrailNode[] = [
  {
    id: 'antony',
    year: 360,
    yearLabel: 'c. 360',
    title: 'Life of Antony',
    author: 'Athanasius',
    match: 'Life_of_Antony',
  },
  {
    id: 'basil',
    year: 370,
    yearLabel: 'c. 370',
    title: 'St. Basil & His Rule',
    author: 'St. Basil',
    match: 'Saint-Basil',
  },
  {
    id: 'augustine',
    year: 400,
    yearLabel: 'c. 400',
    title: 'Confessions',
    author: 'St. Augustine',
    stub: true,
  },
  {
    id: 'cassian',
    year: 425,
    yearLabel: 'c. 425',
    title: 'The Conferences',
    author: 'John Cassian',
    match: 'Cassian',
  },
  {
    id: 'benedict-rule',
    year: 530,
    yearLabel: 'c. 530',
    title: 'Rule of St. Benedict',
    author: 'St. Benedict',
    match: 'Rule_of_St_Benedict',
  },
  {
    id: 'gregory-benedict',
    year: 594,
    yearLabel: 'c. 594',
    title: 'Life of St. Benedict',
    author: 'Gregory the Great',
    match: 'Life_of_St_Benedict',
  },
  {
    id: 'bede',
    year: 731,
    yearLabel: 'c. 731',
    title: 'Ecclesiastical History',
    author: 'Bede',
    match: 'Ecclesiastical_History',
  },
  {
    id: 'bernard-knighthood',
    year: 1130,
    yearLabel: 'c. 1130',
    title: 'In Praise of the New Knighthood',
    author: 'St. Bernard of Clairvaux',
    match: 'In_Praise_of_the_New_Knighthood',
  },
  {
    id: 'louis-advice',
    year: 1270,
    yearLabel: 'c. 1270',
    title: 'Advice to His Son',
    author: 'St. Louis IX',
    match: 'Advice_to_His_Son-St_Louis_IX',
  },
  {
    id: 'aquinas',
    year: 1274,
    yearLabel: 'c. 1274',
    title: 'Summa Theologica',
    author: 'St. Thomas Aquinas',
    stub: true,
  },
  {
    id: 'llull-chivalry',
    year: 1275,
    yearLabel: '1274–1276',
    title: 'The Book of the Order of Chivalry',
    author: 'Bl. Ramon Llull',
    match: 'Book_of_the_Order_of_Chivalry',
  },
  {
    id: 'francis',
    year: 1330,
    yearLabel: 'c. 1330',
    title: 'Little Flowers',
    author: 'of St. Francis',
    match: 'Little_Flowers_of_St_Francis',
  },
  {
    id: 'cloud',
    year: 1370,
    yearLabel: 'c. 1370',
    title: 'Cloud of Unknowing',
    author: 'Anonymous',
    match: 'Cloud_of_Unknowing',
  },
  {
    id: 'julian',
    year: 1395,
    yearLabel: 'c. 1395',
    title: 'Revelations of Divine Love',
    author: 'Julian of Norwich',
    match: 'Julian_of_Norwich',
  },
  {
    id: 'kempis',
    year: 1418,
    yearLabel: 'c. 1418',
    title: 'Imitation of Christ',
    author: 'Thomas à Kempis',
    match: 'Imitation_of_Christ',
  },
  {
    id: 'ignatius',
    year: 1548,
    yearLabel: 'c. 1548',
    title: 'Spiritual Exercises',
    author: 'St. Ignatius Loyola',
    match: 'Spiritual_Exercises-St_Ignatius_Loyola',
  },
  {
    id: 'teresa',
    year: 1577,
    yearLabel: 'c. 1577',
    title: 'Interior Castle',
    author: 'St. Teresa of Ávila',
    stub: true,
  },
  {
    id: 'juan',
    year: 1578,
    yearLabel: 'c. 1578',
    title: 'Dark Night of the Soul',
    author: 'St. John of the Cross',
    stub: true,
  },
  {
    id: 'alphonsus-glories',
    year: 1750,
    yearLabel: 'c. 1750',
    title: 'The Glories of Mary',
    author: 'St. Alphonsus',
    match: 'gloriesmary',
  },
  {
    id: 'alphonsus-ascetical',
    year: 1755,
    yearLabel: 'c. 1755',
    title: 'Ascetical Works',
    author: 'St. Alphonsus',
    match: 'thecompleteascet21',
  },
];

export type TrailBook = {
  id: string;
  title: string;
  author?: string;
  filename: string;
  type: string;
  svg?: string;
};

/** Prefer epub over pdf when both match. */
export function resolveTrailBook(
  node: SaintsTrailNode,
  library: TrailBook[]
): TrailBook | null {
  if (!node.match) return null;
  const needles = (Array.isArray(node.match) ? node.match : [node.match]).map((n) =>
    n.toLowerCase()
  );
  const hits = library.filter((b) => {
    const f = b.filename.toLowerCase();
    return needles.some((n) => f.includes(n));
  });
  if (!hits.length) return null;
  return hits.find((b) => b.type === 'epub') || hits[0];
}

/** Zigzag rows for snake layout (L→R, R→L, …). */
export function snakeRows<T>(items: T[], cols = 3): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    const slice = items.slice(i, i + cols);
    const rowIdx = rows.length;
    rows.push(rowIdx % 2 === 1 ? [...slice].reverse() : slice);
  }
  return rows;
}
