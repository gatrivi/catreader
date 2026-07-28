# Dead wiring audit — catreader (2026-07-27)

Optional UI / hooks that look live but aren't fully connected.

| Item | Status |
|------|--------|
| `EditModal.onDelete` | Fixed v2.10.3 |
| `LibraryView.clearProgress` | **REMOVED** v2.10.4 |
| `getReadingProgress` / cover aura | **FIXED** v2.10.4 — `localProgress.ts` scans `catreader_progress_*`; open book live |
| `BookCover` HTML5 drag grip | **REMOVED** v2.10.4 — pointer drag only |
| `enrichWithOpenLibrary` | **WIRED** v2.10.4 — Library settings “Open Library” |
| EPUB `onTocLoaded` | **REMOVED** v2.10.4 — unused |
| `onPageRenderError` | optional on ReaderView; check if App passes |

Rule: if a prop is optional and gated with `{onX && (...button...)}`, missing pass = invisible feature.
