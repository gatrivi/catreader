# Handoff — 2026-08-02

## v2.10.18 — Discover feed recovery

- Renamed the ambiguous `Otro` action to `Siguiente`; it skips only the current
  fragment and never changes book preferences.
- `Más libro` now applies a soft, interleaved promotion instead of moving every
  passage from that book to the front.
- Feed order and taste state are versioned so the previous beta's poisoned
  session/local state is ignored automatically after update.
- Exact duplicate passages from the same book are filtered at feed load.
- Added a visible reset-preferences control to the Discover header.

Validation: `npm run lint`, `npm test -- --run`, `npm run build`.

## v2.10.17 — text-first reader

Shipped on branch `agent/text-first-reader` and based on `main` at the current
remote head.

- PDFs open in the lightweight `TextReaderView` by default.
- `scripts/generate-feed.js` emits one page-text JSON asset per PDF under
  `public/reader/`; `books.json` exposes it as `reader`.
- The original PDF and the lazy `ReaderView`/PDF.js chunk load only after
  **Ver original PDF**.
- Discover no longer warms/downloads a full book on hover or pointer-down.
- Existing IndexedDB ghost text remains the offline fallback; old builds and
  locally uploaded PDFs can use the existing current-page extraction path.

Validation: `npm run lint`, `npm test`, `npm run build`.

The repository still stores the real books as PDF/EPUB/TXT. JSON is the
catalog/feed/page-text cache, not a replacement for the source books.

---

**Version:** `v2.10.7`

## Truth
v2.10.6 cover “fix” shipped without verify — **broken** (syntax error + cloud hang).

## v2.10.7
- Fixed compile; local-first covers; cloud ≤2.5s gaps-only
- Playwright: no cover src swap across 7s after paint
- Selection still quote-only

## Don’t break
PROGRESS_SACRED, READER_MODE_LAZY, CATTS
