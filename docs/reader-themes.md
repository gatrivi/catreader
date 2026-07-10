# Reader themes & reader mode

## Paper Soul (v2.9.2+)

Per-book stain bake + grain overlay when theme = **paper**. See `docs/paper-soul-implementation-plan.md`.

- Bake: `npm run paper-bake -- <filename>` → `public/books/paper/<id>/`
- Index: `generate-library.js` sets `books.json` → `paper` path
- Render: `usePaperTexture` + `PaperLayer` on **PDF canvas** (multiply overlay, filter sibling) and **text/EPUB**
- Ink: TXT per-char, ghost HTML per-word (`applyInkVariance`)
- Utils: `src/utils/paperSoul.ts`

---

## Themes (PDF tint)

Header / More menu: `light | sepia | paper | dim | dark`.

| Theme | BG | PDF CSS filter (anti-glare) |
|-------|-----|------------------------------|
| light | `#f8f9fa` | `contrast(0.95)` |
| sepia | `#e8dcc7` | `sepia(0.4) contrast(0.9) brightness(0.9)` |
| **paper** | `#f4ead5` | `sepia(0.2) contrast(1.1) brightness(0.95) saturate(1.1)` — soft “old paper”, less blinding white |
| dim | `#334155` | invert + hue-rotate |
| dark | `#121212` | full invert |

- Applied in `App.tsx` → `themeStyles` + `pdfFilter`.
- PDF pages get `style={{ filter: pdfFilter[theme] }}` in `ReaderView.tsx`.
- TXT / reader-mode text uses `themeStyles` on the text container.
- Persisted via `useReaderSync` → localStorage `catreader_theme` + cloud progress.sync.
- Note: `useReaderSync` Theme type is still `'light'|'dim'|'dark'|'sepia'` — `paper` works in UI but may not type-check / sync cleanly until that union is extended.

## Reader mode (“Modo lector”)

Toggle: BookText button in reader header (desktop) or More → “Modo lector” (mobile). Exit: same toggle or “Ver original PDF” on a text page.

**What it does:** swaps PDF canvas for extracted HTML text (serif, reflowable, theme-colored). Same page numbers / scroll sync (`text-page-N` vs `page-N`).

**Ghost text pipeline** (`App.tsx`):
1. IndexedDB `coverDB.getGhostText(filename)`
2. else cloud `syncService.loadGhostText`
3. else lazy pdf.js extract (`extractGhostTextLazy`): first 20 pages ASAP, rest in background → `parsePdfPageSemantically` → JSON array cached local + cloud.

TXT files always use the text view (no toggle needed).

**Key files:**
- `src/App.tsx` — themes, toggle, ghost extract
- `src/components/ReaderView.tsx` — PDF vs text render
- `src/services/db.ts` — `ghostText` store
- `src/services/syncService.ts` — cloud ghostText
