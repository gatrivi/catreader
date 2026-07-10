# Paper Soul — Implementation Plan
*(catreader ⇄ catts bridge)*

## TLDR
Bake per-book paper/ink "damage" once, on your rig, via catts. Ship the tiny output as static assets in catreader's `/public/books/`. Composite it at read time with cheap CSS/canvas. No GPU needed for the bake. No server needed at runtime. This is additive to what already exists — not a rewrite.

## Reality check
- Bake cost: well under 50ms/book on CPU alone. The RX 6600 isn't needed here — save it for XTTS.
- Fits easily inside your ~60% RAM/CPU headroom even while the interpreting platform is running.
- Runtime cost: a few KB of images + a couple of CSS classes. No WebGL for v1.
- $0 infra: catreader stays a static Vercel/Netlify site. The bake happens locally, once, and gets committed the same way your covers already do.
- Your "almost real-time" instinct doesn't need testing — the bake isn't in the reading path at all, so there's no 3-second wall to hit.

## What already exists — don't rebuild this
- catreader already has a **Paper Mode** (anti-glare "Old Paper" theme for PDFs, shipped in v2.7.1). This plan upgrades it — it doesn't replace it.
- `scripts/gemini-enrich.js` (`npm run enrich`) already OCRs books and bakes unique SVG covers once, per book, into static assets. The new bake step follows this exact pattern, just producing paper assets instead of covers.
- `scripts/generate-library.js` already indexes `/public/books/` into `books.json` at `predev`/`prebuild`. Extend it — don't fork it.
- `src/hooks/` already holds `useLibrary`, `useReaderSync`, `useGoogleDrive`. Add `usePaperTexture` alongside them.
- catts already extracts + chapterizes book text on CPU for the audiobook flow. Reuse that pass instead of re-parsing the book.

## Phase 1 — Bake (catts, runs on your rig, once per book)
New module: `services/paper_bake.py`. Wire it in as a sibling job to whatever currently handles `/jobs/audiobook` (grep `api/` for that route) — same job-queue pattern, new job type, e.g. `POST /jobs/paperbake`.

Per book:
1. `seed = sha256(file_hash or title+author)` — deterministic, so the same book always looks the same.
2. Generate 5–15 "stain sources" with a seeded RNG:
   `{ id, page_center, radius_pages, x, y, r_px, intensity, warp_seed }`
3. This is the "spans several pages in a 3D manner" part — model it as a Gaussian falloff across page depth, no simulation needed:
   `opacity(page) = intensity * exp(-((page - page_center) ** 2) / (2 * radius_pages ** 2))`
   Closed-form, near-zero compute, gets you most of the effect. (True 3D simplex noise is the fancier upgrade later if you want more organic bleed — nice-to-have, not MVP.)
4. Render each stain source **once** as a small domain-warped blob (~256px WebP) — one image per *stain*, not per *page*. K stains, not N pages — this is what keeps per-book weight tiny.
5. Output: `paper-manifest.json` (seed, palette tint, stain list) + `stains/*.webp` (the K blobs).
6. Drop at `catts/output/<book_id>/paper/` → sync into `catreader/public/books/<book_id>/paper/`, same folder convention your covers already use.

Skip this entirely for scanned/photographed PDFs — those pages already have real paper texture baked into the photo. Only run it for born-digital text (TXT/EPUB/vector PDF).

## Phase 2 — Bridge
Extend `scripts/generate-library.js`: while indexing a book, check for `public/books/<id>/paper/paper-manifest.json`; if present, fold it (or its path) into that book's `books.json` entry. Same mechanism it already uses for covers — no new indexing system.

## Phase 3 — Render (catreader)
New hook `src/hooks/usePaperTexture.ts`: given `bookId` + current page, reads the manifest (already in `books.json`, no extra fetch) and returns which stain images apply to this page plus their computed opacity/position from the formula above.

New/extended component `<PaperLayer>`, absolutely positioned behind page content:
- **Layer 1 (bottom):** shared tileable grain — plain `background-image` + `background-repeat`. One shared asset, loaded once, cached forever by the browser/CDN.
- **Layer 2:** the 1–3 stain images relevant to this page, `mix-blend-mode: multiply`, positioned/scaled/faded per the manifest math.
- **Layer 3 (EPUB/TXT only — real DOM text):** ink variance. Skip a texture atlas for v1; cheapest version is pure CSS — 6–8 classes (`.ink-0`…`.ink-7`, tiny `opacity`/`font-weight`/`letter-spacing` jitter) assigned per character via `hash(charCode, index) % 8`. Zero runtime cost, kills the too-perfect-vector flatness.
- Skip layers 2–3 for scanned PDF pages (`react-pdf`/pdfjs raster) — just keep the existing Paper Mode color/vignette treatment there for visual consistency across the library.

Prefetch: piggyback on the adjacent-page pre-buffering you already do — when page *n+1* pre-renders, warm its stain assets too. They're tiny; this is free.

## Phase 4 — Shared static assets (one-time, cheap)
Don't procedurally generate paper-fiber grain from noise. Photograph 2–3 real blank aged/plain paper scraps once, seamless-tile them in any free tool, ship as static assets. Reserve procedural generation for the part that actually needs per-book uniqueness — stain placement — not for fidelity you can get free from a real photo.

## Weight budget
| Asset | Size | Loaded |
|---|---|---|
| Shared grain tiles | ~100–300KB total | once, cached forever |
| Ink-variance CSS | <1KB | once |
| Per-book `paper-manifest.json` | 1–3KB | per book |
| Per-book stain blobs (K≈10) | 50–100KB | per book |

## Rollout checklist
- [x] Bake script in catreader (`scripts/paper-bake.js`) — catts `paper_bake.py` still TODO when catts is available
- [x] Output under `public/books/paper/<id>/` for sample books
- [x] `generate-library.js` folds the manifest path into `books.json`
- [x] `usePaperTexture` + `<PaperLayer>` — TXT / reader mode / EPUB; PDF raster keeps filter Paper Mode
- [x] Ink-variance CSS on plain TXT under paper theme
- [ ] Roll out bake to rest of library (`npm run paper-bake -- <file>…`)
- [ ] Optional: photo grain tiles replace `public/paper/grain.svg`
- [ ] Optional: catts job `POST /jobs/paperbake`
