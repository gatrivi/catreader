# Reader performance (v2.10.21)

- PDF opening passes a verified cached blob URL or static URL to PDF.js. Uncached books use byte ranges where the host supports them; hosts without ranges still download the full file.
- Express serves /books before SPA middleware and advertises ranges. Bare Vite supports Range but does not advertise Accept-Ranges on its initial response; use npm run dev:local to test partial loading.
- PDF rendering mounts at most five canvases, caps pixel density at 1.5, and measures only mounted pages. No full-book dimension sweep.
- Reader mode uses the same PDF.js runtime as the visual reader. Text sessions deduplicate loads, retry failures, destroy superseded workers, and reject late results. Extraction remains current page then adjacent pages.
- Fragment previews occupy their real page and remain drafts until full extraction. Blank scanned pages show an explanation and the existing original-PDF control.
- Covers display bundled/generated art immediately. Lookup requests time out after five seconds per provider; misses cool down for a minute. Replacement covers enter IndexedDB only after loading successfully. Custom-cover hydration never waits for image downloads.
- Thumbnail caching follows visible images; library enrichment pauses while a book is open.
- Progress storage/schema is unchanged. PDF-to-text remounts still freeze and restore the current page.

Offline: existing full-book IndexedDB and service-worker caches still work. Full-PDF caching starts after 30 seconds of reading and is cancelled if the document is closed/replaced. Offline reopening is available once that download finishes; extracted pages are cached as they are read.

Validation: unit tests cover sources, session retry/cancellation, cover fallback and provider timeout; existing progress guards remain required. Run npm test, npm run lint, npm run build, npm run test:critical. Browser checks must include a later page, both modes, and reopening.

Browser evidence (local Chromium, 2026-09-05): 40,584,194-byte / 1,056-page PDF cold-linked to page 20 transferred 808,042 bytes initially, kept page 20 after close/reopen, and used five canvases. Original PDF switch created canvases in ~1.0 s; Cassian PDF-to-text at page 20 produced text in ~0.65 s. These are local measurements, not production/mobile guarantees. Seven visible library covers loaded successfully; version badge unobstructed.
