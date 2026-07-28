# Cover sacred — comprehensive fix (draft)

**Symptom:** Library paints AI/`books.json` SVG, then swaps to IDB/OL/custom. Worse under `dev` HMR (React state `covers={}` reset) and on new users/devices (empty IDB → idle Google/OL later).

## Root cause (one sentence)

Two paint sources (`book.svg` + async `covers[]`) and idle fetch that can still write a *different* cover after first paint; HMR clears memory but not the race.

## Contract (priority, never silent downgrade)

| Rank | Source | Persist |
|------|--------|---------|
| 1 | `user-custom` | IDB blob + Storage URL in `coverSource` |
| 2 | `catalog` (Google/OL) | IDB URL/blob + `coverSource.url` + type |
| 3 | `bundled` / `ai-svg` | IDB svg string + `coverSource.type` |
| 4 | canvas fallback | IDB only |

`force` (user Magic / upload) may replace. Idle/auto **never** replaces rank ≥ existing.

## Rules that fix all three contexts

### A. Single render path
`BookCover` shows **only** `covers[filename]` after hydrate. No `book.svg` parallel fallback once `coversHydrated === true`. Before hydrate: skeleton (same aspect), not SVG.

### B. Hydrate before shelf paint
`fetchLibrary`:
1. Load books.json (do **not** show shelf covers yet — keep loading/skeleton).
2. Await IDB covers (+ metadata merge).
3. For each book **missing** IDB cover:
   - `user-custom` + url → rehydrate cloud (existing).
   - else if `coverSource.url` (catalog) → use URL immediately, save IDB.
   - else if bundled `book.svg` → **seed IDB once** as `bundled`, put in `covers`.
   - else leave empty → idle fetch allowed once.
4. `setCovers` + `coversHydrated=true` **then** show library.

First stable paint = final cover for returning users.

### C. New user / new device
- Cloud metadata must carry `coverSource: { type, url? }` for **catalog + custom**, not only custom.
- On empty IDB: prefer cloud `coverSource.url` → one paint; sync blob to IDB in background.
- No cloud + has `books.json` svg → seed bundled (stable), **do not** later OL-overwrite unless user force.
- Truly empty → one idle catalog fetch; write type+url to metadata/cloud so device #2 matches.

### D. Dev HMR
Module singleton survives Vite HMR:

```ts
// src/services/coverMem.ts
export const coverMem: { map: Record<string, string>; hydrated: boolean } =
  (import.meta.hot?.data.coverMem as any) ?? { map: {}, hydrated: false };
if (import.meta.hot) import.meta.hot.data.coverMem = coverMem;
```

On hook mount: seed React state from `coverMem`; after IDB load merge into both. HMR remount ≠ blank → SVG flash.

### E. Idle scan (tighten)
`shouldSkipCoverFetch`: skip if IDB **or** `coverMem` **or** any `coverSource.type` set.
Remove path that writes Gemini svg when a non-svg IDB exists (already partial) — also skip when bundled already seeded.
Never Google→OL after bundled seed without `force`.

## Acceptance

| Context | Expect |
|---------|--------|
| Cold load returning device | One cover, no swap |
| `npm run dev` + HMR | No SVG→photo flicker |
| New device, prior custom | Cloud URL → same cover, IDB backfill |
| New device, catalog chosen | Same OL/Google URL via metadata |
| New user, only books.json svg | Bundled once; stays unless user force |
| Idle Magic / upload | Explicit replace OK |

## Touch list (small diffs)

1. `src/services/coverMem.ts` — HMR-safe mem  
2. `src/utils/covers.ts` — rank helpers + stricter skip  
3. `src/hooks/useLibrary.ts` — hydrate gate, seed bundled, sync coverSource for catalog  
4. `src/components/BookCover.tsx` — no svg fallback post-hydrate; skeleton  
5. `LibraryView` — respect `coversHydrated`  
6. Tests: `covers.test.ts` + hydrate order test  
7. Docs: this file; bump when shipped  

## Out of scope
Art-deco API swap; saints trail UI.

## Status
**Shipped v2.10.7** (verified in Playwright: no cover fingerprint swap 0–7s).

v2.10.6 was broken: syntax error in `removeBook` + hydrate blocked on hanging cloud metadata → overlay/endless spinner. Fixed: local-first hydrate, cloud 2.5s timeout gaps-only, atomic commit, stamp orphan IDB `coverSource`.
