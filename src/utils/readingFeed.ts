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

/** Drop exact repeated passages from the same source book. */
export function dedupeFeedItems(items: ReadingFeedItem[]): ReadingFeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const text = item.text.trim().replace(/\s+/g, ' ');
    if (!text) return false;
    const key = `${item.filename}\u0000${text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Apply a book preference without creating a long same-book run.
 * “More” promotes one passage and then spaces the rest roughly one in four.
 */
export function reorderFeedIdsByBook(
  order: string[],
  catalog: ReadingFeedItem[],
  filename: string,
  direction: 'more' | 'less'
): string[] {
  const itemsById = new Map(catalog.map((item) => [item.id, item]));
  const matching = order.filter((id) => itemsById.get(id)?.filename === filename);
  const rest = order.filter((id) => itemsById.get(id)?.filename !== filename);

  if (direction === 'less' || matching.length === 0 || rest.length === 0) {
    return direction === 'less' ? [...rest, ...matching] : [...matching, ...rest];
  }

  const result = [matching[0]];
  let matchingIndex = 1;
  let restIndex = 0;
  let restSinceMatch = 0;

  while (matchingIndex < matching.length || restIndex < rest.length) {
    if (matchingIndex < matching.length && restIndex < rest.length && restSinceMatch >= 3) {
      result.push(matching[matchingIndex++]);
      restSinceMatch = 0;
    } else if (restIndex < rest.length) {
      result.push(rest[restIndex++]);
      restSinceMatch += 1;
    } else {
      result.push(matching[matchingIndex++]);
    }
  }

  return result;
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
