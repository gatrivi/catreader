# PDF Open Performance — Findings (2026-09-07)

**Symptom:** cold-opening a PDF takes ~20s. Warm (IndexedDB-cached) opens are fine.

## TL;DR

Not a rendering problem — it's the network strategy. Every PDF loads with
`{ disableStream: true, disableAutoFetch: true }`, forcing pdf.js to fetch the
file as dozens of **sequential 64KB range requests**. Books are 30–40MB
(542MB total in `public/books/`), so first page needs ~80–100 serialized round
trips (~150–250ms each) ≈ 15–20s. One streaming download of the same file
would take 2–4s.

## Findings (by impact)

### 1. Range-chunk strategy is the root cause
- `src/utils/pdfSource.ts:2` — `PDF_LOAD_OPTIONS = { disableStream: true, disableAutoFetch: true }`.
- Used by BOTH loaders: react-pdf `Document` (`ReaderView.tsx`) and `PdfTextSession` (`pdfTextSession.ts:31`).
- pdf.js default `rangeChunkSize` = 64KB; parse dependencies serialize most requests.
- `disableStream: true` also blocks "render while downloading", which would show page 1 early.
- Irony: the comment says "avoids downloading an entire PDF before the first page" — at these sizes it's strictly slower than just downloading it.

### 2. Same book downloaded 2–3x
- pdf.js pulls its range chunks (network pass #1).
- 30s after open, `cachePdfAfterOpening` (`pdfOfflineCache.ts:8`) calls `pdf.getData()`; with `disableAutoFetch` this downloads the **entire remaining file** in the background while the user reads (bandwidth thief → slow page turns).
- SW third copy never fills: `vite.config.ts` `books-cache` (CacheFirst, `rangeRequests: true`) rejects pdf.js's `206` responses because `cacheableResponse: statuses [0, 200]` excludes 206. Dead weight.
- Only IndexedDB layer actually works (`coverDB.saveBookContent`).

### 3. Text mode and canvas mode each open their own pdf.js document
- Text-first is ALWAYS used for PDFs (`openMode.ts` returns true for any pdf).
- `PdfTextSession` loads one document; toggling "Ver original PDF" mounts `Document` in `ReaderView.tsx:465` — a separate full load (second chunk dance on mode switch). No sharing.

### 4. Minor render-side costs (felt after load, not the 20s)
- Each visible page renders canvas + text layer + annotation layer at width 800 × DPR 1.5 (`ReaderView.tsx:236-250`).
- `Page` gets both `scale={zoom}` and `width={800}` — react-pdf ignores `scale` when `width` is set → zoom prop likely dead there.
- `parsePdfPageSemantics` row grouping is O(n²)-ish per page — fine in practice (worker-fed).

### Ruled out
- Cloud progress sync: capped at 1.2s race (`useReaderSync.ts:138-141`).
- Ghost-text pipeline: properly lazy (word → snippet → page → ±1).
- IntersectionObserver / MutationObserver setup: reasonable.
- StrictMode double-mount: already disabled (`main.tsx`).

## Recommended fixes

> **Status: FIXED in v2.10.22** — 1, 2 and 3 applied. `pdfSource` now does one
> streaming download (with a progress toast), writes it to IndexedDB, and serves
> a blob URL shared by both reader modes; `PDF_LOAD_OPTIONS` flags removed; SW
> books-cache route removed. Item 4 is moot: both modes read the same local blob.

1. **Cache miss → one streaming full download** with progress bar; feed blob to pdf.js; save to IDB. Cold open becomes one sequential download.
2. **Drop `disableStream: true`** (or all of `PDF_LOAD_OPTIONS` once #1 lands).
3. **Remove SW `books-cache` route** — IDB owns offline; SW layer can only misfire.
4. Share one pdf.js document (or the blob) between text and canvas modes.

Fixes 1–3 are contained, testable, and do not touch FEATURE #1 (sacred progress).
