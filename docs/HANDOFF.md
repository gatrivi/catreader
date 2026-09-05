# Handoff — 2026-09-05

Version: `v2.10.21`. App commit: `c82b493`, pushed to `origin/main`.

## Priority
Make everyday reading dependable. User explicitly chose handoff unless a critical workflow bug is confirmed. E-ink is marginal; focus on opening books, covers, speed, and preserved progress.

## Shipped and verified
- Demand-loaded PDFs, at most five canvases, no full-book dimension sweep.
- Shared PDF.js runtime; cancellable/retryable text sessions; lazy current-page extraction.
- Cold deep-link page-reset race fixed; placeholders cannot release restoration early.
- Available cover art stays visible; provider timeouts; enrichment pauses during reading.
- Full offline PDF caching starts after 30 seconds; service worker handles cached ranges and precaches the PDF worker.
- Version badge remains visible above the toolbar.
- 153 tests, TypeScript, production build, and critical artifact checks passed.
- Local Chromium: 40 MB / 1,056-page PDF initially transferred ~808 KB; page 20 survived close/reopen; full offline cache populated. Cassian PDF-to-text at page 20 took ~650 ms. Production bundle returned correct cached HTTP 206 bytes.
- Seven visible covers loaded; all 44 PDF files have PDF headers. These checks do not establish real-phone or deployed-site reliability.

## Preserve existing uncommitted edits
- `src/components/EpubView.tsx`: blob-to-bytes opening, disposal guard, timeout/error UI. Needs verification, including setup rejection and reopening after failure.
- `src/main.tsx`: StrictMode disabled for the EPUB mount issue.
- `src/utils/healthCheck.ts`: raw filename URL change.
These predate the performance work and were deliberately left uncommitted. Inspect before editing or shipping.

## Next pass
1. Identify the actual deployed URL; test a fresh profile, mobile viewport/real phone, and slow network.
2. Exercise library → open PDF/EPUB/TXT → scroll → switch mode → close → reopen/refresh. Check page, zoom, theme, and failure recovery.
3. Verify the local EPUB/startup fixes and add browser regressions for confirmed failures. Scanned pages without selectable text require original PDF; OCR is not implemented.
4. Fix verified blockers, document briefly, run checks, then push per AGENTS.md. No known unresolved critical bug in the PDF workflows tested above; EPUB and deployment remain unverified.

Read `docs/PROGRESS_SACRED.md`, `docs/READER_MODE_LAZY.md`, and `docs/reader-performance.md`. Never persist a transient page.

Deferred: Paper Soul full bake/photo grain, DnD preview, shelf nesting, and EPUB live audio. Test servers and browser sessions from this pass were stopped.
