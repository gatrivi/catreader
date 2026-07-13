# CatReader architecture (v2.9.2)

TLDR map of the live app. Prefer this over README fluff / old session notes.

## Stack

- React 19 + Vite 6 + Tailwind 4 + Motion
- PDF: `react-pdf` / pdf.js · EPUB: `epubjs` · TXT: chunked text view
- Sync: Firebase Auth (anon + portable username/PIN) → Firestore + Storage
- Local cache: IndexedDB (`CatReaderDB`) · PWA: `vite-plugin-pwa`
- Dev server: `tsx server.ts` (Express + Vite middleware, port 3000)

## Entry

| Path | Role |
|------|------|
| `src/main.tsx` | Mount |
| `src/App.tsx` | Orchestrator (~1.2k lines). Version badge = `APP_VERSION` |
| `src/index.css` | Global + ink-variance classes |
| `src/firebase.ts` | Firestore / Auth / Storage |
| `public/books.json` | Build-time library index |
| `public/books/*` | Static book files |
| `public/books/paper/<id>/` | Paper Soul bake assets |
| `public/paper/grain.svg` | Shared paper grain |

## Hooks (`src/hooks/`)

| Hook | Owns |
|------|------|
| `useLibrary` | Load `books.json` + cloud metadata, covers, idle Gemini enrichment |
| `useShelves` | 8 shelves, localStorage `catreader_shelves_v2`, auto-assign unassigned books |
| `useReaderSync` | Page / zoom-per-device / theme / epubCfi; localStorage + Firestore |
| `useGoogleDrive` | Drive picker + upload |
| `usePaperTexture` | Load paper manifest + prefetch stains for nearby pages |

## Components (`src/components/`)

| Component | Owns |
|-----------|------|
| `LibraryView` | Paged 4×4 racks, DnD, search (`/`), wallpaper, highlights strip |
| `BookCover` | Cover render, format badge, open |
| `ReaderView` | Virtualized PDF scroll, TXT/ghost text, PaperLayer |
| `EpubView` | EPUB.js continuous/scroll + CFI |
| `PageInput` | Jump-to-page |
| `EditModal` | Title/author/cover edit |
| `ProfileModal` | Portable profile (username/PIN → SHA-256 uid) |
| `PaperLayer` | Grain + stain overlay when theme=`paper` |
| `SadMonkIcon` | Empty / error art |

## Services

| Module | Owns |
|--------|------|
| `syncService` | progress, metadata, covers (Storage), ghostText, highlights, settings |
| `authService` | portable id / username / PFP in localStorage |
| `db` (`coverDB`) | IndexedDB: covers, content blobs, ghostText, highlights, bookMetadata |

## Utils

| Module | Owns |
|--------|------|
| `routing` | `/shelf/book[/page[/quad]]`, legacy `?book=&page=`, share URLs |
| `reader` | clamp/offset page, `PDF_RENDER_WINDOW=8`, library search filter |
| `pdfParser` | Semantic page → HTML for “Modo lector” |
| `paperSoul` | Stain falloff, ink-variance wrappers, safe book ids |
| `image` | Thumbnails / capture helpers |

## Scripts

| npm script | Does |
|------------|------|
| `predev` / `prebuild` | `generate-library.js` → `public/books.json` (+ `paper` path if baked) |
| `dev` | Express+Vite |
| `build` | Vite build + `post-build.js` |
| `enrich` | Gemini OCR + SVG covers CLI |
| `paper-bake` | Stand-in Paper Soul bake → `public/books/paper/<id>/` |
| `test` | Vitest |
| `lint` | `tsc --noEmit` |

## Data model (short)

- **Book (books.json):** `{ id, filename, type, title?, author?, svg?, paper? }`
- **Shelf:** `{ id, title, bookIds: string[] }` — ids = filenames
- **Progress:** `{ page, zoom: number|{mobile,tablet,desktop}, theme, scrollRatio, epubCfi?, updatedAt }`
- **Auth path:** portable hash if logged in, else Firebase anonymous uid

## Routing

- Library: `/` (respects Vite `BASE_URL`)
- Book: `/{shelfSlug}/{bookSlug}` optional `/{page}/{quadrant}`
- Legacy: `?book=file.pdf&page=N`

## Themes

`light | sepia | paper | dim | dark` — see `docs/reader-themes.md`. Paper Soul: `docs/paper-soul-implementation-plan.md`.

## Tests (critical)

See `docs/perf-and-tests.md`. Run `npm test` before push.

## Known gaps

- Shelf nesting not implemented
- DnD has no ghost preview (opacity fade only)
- Paper bake: Node stand-in only; catts job + photo grain still TODO
- Highlights sync exists in services; full annotation UX still light
