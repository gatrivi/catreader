# Handoff — 2026-08-02

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
