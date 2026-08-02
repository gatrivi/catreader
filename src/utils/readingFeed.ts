export type FeedLocator = {
  kind: 'pdf' | 'epub' | 'txt';
  page?: number;
  href?: string;
  offset?: number;
  sourceLength?: number;
  label?: string;
  paragraph?: number;
};

export type ReadingFeedItem = {
  id: string;
  bookId: string;
  filename: string;
  type: string;
  title: string;
  author?: string;
  text: string;
  locator: FeedLocator;
};

export type FeedBook = {
  id: string;
  filename: string;
  title: string;
  author?: string;
  type: string;
};

/** Stable enough for a session: avoids a new order every time Back remounts the feed. */
export function shuffleFeedIds(items: ReadingFeedItem[], seed: number): string[] {
  const ids = items.map((item) => item.id);
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };

  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids;
}

export function feedLocationLabel(locator: FeedLocator): string {
  if (locator.kind === 'pdf') return locator.page ? `p. ${locator.page}` : 'PDF';
  if (locator.kind === 'epub') return locator.label || 'capítulo';
  return locator.label || 'texto';
}

/** Maps non-PDF feed locators onto the stand-in Paper Soul depth (about 40 pages). */
export function paperPageForFeedItem(locator: FeedLocator): number {
  if (locator.kind === 'pdf') return Math.max(1, locator.page || 1);
  if (locator.kind === 'txt' && locator.sourceLength && locator.offset != null) {
    return Math.max(1, Math.min(40, Math.round((locator.offset / locator.sourceLength) * 39) + 1));
  }
  if (locator.kind === 'epub' && locator.paragraph != null) {
    return Math.max(1, Math.min(40, Math.round(locator.paragraph / 25) + 1));
  }
  return 1;
}
