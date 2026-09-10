import { useEffect, useState } from 'react';
import { getCachedFilenames, subscribeContentCacheChanged } from '../utils/contentCacheIndex';

/** Filenames whose PDF/EPUB blob is already on this device (drives library cache badges). */
export function useCachedFilenames(): Set<string> {
  const [cached, setCached] = useState<Set<string>>(() => getCachedFilenames());
  useEffect(() => subscribeContentCacheChanged(() => setCached(getCachedFilenames())), []);
  return cached;
}
