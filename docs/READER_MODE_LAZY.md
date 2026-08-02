# READER MODE / GHOST TEXT — LAZY OR IT’S BROKEN

```
DO NOT EXTRACT THE WHOLE BOOK UP FRONT.
DO NOT EXTRACT “FIRST 20 PAGES FROM PAGE 1”.
DO NOT BLOCK THE USER ON FULL-BOOK TEXT BUILD.
DO NOT WAIT FOR THREE FULL PAGES BEFORE SHOWING TEXT.

FEATURE #1 PAGE IS THE ANCHOR.

PROCEDURAL PIPELINE (v2.10.2+):
  1. FIRST WORD on synced page P  → paint immediately (draft)
  2. SNIPPET (~sentence) on P     → paint
  3. FULL semantic HTML for P     → paint + cache
  4. PREFETCH ±1 in background    → never blocks P

CACHE WHAT YOU TOUCH.
WORD → SNIPPET → PAGE → NEIGHBOR.
NEVER THE OTHER WAY AROUND.
```

Code: `App.ensureGhostAround` + `src/utils/ghostText.ts`
(`firstWordHtml` → `snippetHtml` → `parsePdfPageSemantically` → prefetch).
Progress freeze: `docs/PROGRESS_SACRED.md`.

## v2.10.17: text-first opening

The source files are still static PDF/EPUB/TXT files. `books.json` is only the
catalog, and `feed.json` only contains Discover excerpts. During the build,
`scripts/generate-feed.js` also extracts PDF pages into:

```text
public/reader/<safe-file-name>.pdf.json
```

`scripts/generate-library.js` records that path as `book.reader`. Opening a
PDF fetches this small page-text asset and renders `TextReaderView`; it does
not fetch the original PDF or import the PDF reader chunk. The original file
is fetched only after the user chooses **Ver original PDF**.

The page JSON is cached in IndexedDB as ghost text. Older deployments and
locally uploaded PDFs fall back to the existing `ensureGhostAround` pipeline,
which extracts only the current page and nearby pages from a locally available
PDF. Discover no longer prefetches a full PDF on hover or pointer-down.
