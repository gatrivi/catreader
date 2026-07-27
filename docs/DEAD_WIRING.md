# Dead wiring audit — catreader (2026-07-27)

Optional UI / hooks that look live but aren't fully connected.

| Item | Status |
|------|--------|
| `EditModal.onDelete` | Fixed v2.10.3 |
| `LibraryView.clearProgress={() => {}}` | **NOOP** — passed empty fn from App |
| `getReadingProgress` | **STUB** — returns 0 except open book (cover aura fake) |
| `BookCover` HTML5 `onDragStart` | **DEAD** — pointer drag replaced it; props unused |
| `enrichWithOpenLibrary` | **EXPORT ONLY** — never called from App |
| EPUB `onTocLoaded` | optional, unused |
| `onPageRenderError` | optional on ReaderView; check if App passes |

Rule: if a prop is optional and gated with `{onX && (...button...)}`, missing pass = invisible feature.
