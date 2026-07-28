/** HMR-safe cover map — survives Vite remount so library doesn’t flash SVG→IDB. */

export type CoverMem = {
  map: Record<string, string>;
  hydrated: boolean;
};

const hot = import.meta.hot?.data as { coverMem?: CoverMem } | undefined;

export const coverMem: CoverMem = hot?.coverMem ?? { map: {}, hydrated: false };

if (import.meta.hot) {
  import.meta.hot.data.coverMem = coverMem;
}

export function coverMemSet(filename: string, cover: string) {
  coverMem.map[filename] = cover;
}

export function coverMemMerge(batch: Record<string, string>) {
  Object.assign(coverMem.map, batch);
}

export function coverMemMarkHydrated() {
  coverMem.hydrated = true;
}
