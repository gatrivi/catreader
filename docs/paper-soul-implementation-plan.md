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
- catreader already has a **"paper" theme** — but it's just a flat CSS filter (`sepia(0.2) contrast(1.1) brightness(0.95) saturate(1.1)`, bg `#f4ead5`), applied uniformly, no per-page variation. **This is the gap this plan fills** — reuse this theme slot, don't add a 6th toggle.
- Themes live in `App.tsx` (`themeStyles` + `pdfFilter`), applied in `ReaderView.tsx` via `style={{ filter: pdfFilter[theme] }}` (PDF canvas) or `themeStyles` (text container). **A CSS `filter` only transforms the element's own pixels — it can't pull in a background image.** So the stain/grain layer has to be a separate sibling element behind the canvas/text, not folded into `pdfFilter`.
- **"Modo lector" / ghost text is the key asset here.** Toggling reader mode swaps the PDF canvas for extracted HTML text via `extractGhostTextLazy` → `parsePdfPageSemantically`, cached in IndexedDB (`db.ts`) and synced via `syncService.ts`. That's already real per-page, per-character DOM text — exactly what the ink-variance trick needs, for free. TXT files use this same text path always; EPUB likely does too.
- `scripts/gemini-enrich.js` (`npm run enrich`) already OCRs books and bakes unique SVG covers once, per book, into static assets. The new bake step follows this exact pattern, just producing paper assets instead of covers.
- `scripts/generate-library.js` already indexes `/public/books/` into `books.json` at `predev`/`prebuild`. Extend it — don't fork it.
- catts already extracts + chapterizes book text on CPU for the audiobook flow. Reuse that pass instead of re-parsing the book.

## Phase 0 — fix this first (small, ~5 min)
`useReaderSync`'s `Theme` type must include `'paper'`. Done in v2.9.1.

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
6. Drop at `catts/output/<book_id>/paper/` → sync into catreader.

**Path note (catreader):** books are flat files under `public/books/*.pdf`, so `public/books/<file>/paper/` collides with the file. Actual layout: `public/books/paper/<safeId>/` + `books.json.paper` path. Stand-in bake: `npm run paper-bake` (`scripts/paper-bake.js`, SVG stains until catts WebP).

Skip this entirely for scanned/photographed PDFs — those pages already have real paper texture baked into the photo. Only run it for born-digital text (TXT/EPUB/vector PDF).

## Phase 2 — Bridge
Extend `scripts/generate-library.js`: while indexing a book, check for paper manifest; if present, fold path into that book's `books.json` entry. Done.

## Phase 3 — Render (catreader, real integration points)
Trigger condition: `theme === 'paper'` (not a new toggle — reuse the existing one).

In `ReaderView.tsx`, `<PaperLayer>` as an absolutely-positioned sibling **behind** whichever path is rendering:
- **Layer 1 (bottom), both render paths:** shared tileable grain (`public/paper/grain.svg`).
- **Layer 2, both render paths:** 1–3 stain images for this page, `mix-blend-mode: multiply`, Gaussian falloff. PDF: per-page behind canvas (filter stays on canvas sibling only — not on the layer).
- **Layer 3, text-render path only** (ghost text / TXT): ink variance `.ink-0`…`.ink-7`. Plain TXT = per-char; HTML ghost text = per-word (span budget).

Prefetch: warm stain assets for page n / n+1 in `usePaperTexture`.

## Discover / social card (v2.10.16)

- Discover cards reuse the cached grain tile and at most three active per-book stains; no PDF extraction or per-character spans run in the feed.
- `ReadingFeedCard` uses hydrated cover art when available and keeps the paragraph inert; only the explicit `Abrir` button opens the book.
- `Copiar` renders a 1080×1350 PNG only on demand and writes `image/png` + `text/plain` through `ClipboardItem`. Browsers that reject mixed clipboard types fall back to text.

## Phase 4 — Shared static assets (one-time, cheap)
Don't procedurally generate paper-fiber grain from noise. Photograph 2–3 real blank aged/plain paper scraps once, seamless-tile them, ship as static assets. Current stand-in: `public/paper/grain.svg` (feTurbulence).

## Weight budget
| Asset | Size | Loaded |
|---|---|---|
| Shared grain tiles | ~100–300KB total | once, cached forever |
| Ink-variance CSS | <1KB | once |
| Per-book `paper-manifest.json` | 1–3KB | per book |
| Per-book stain blobs (K≈10) | 50–100KB | per book |

## Rollout checklist
- [x] Extend `useReaderSync`'s `Theme` union to include `'paper'`
- [ ] `paper_bake.py` in catts, wired as a job, tested on one book
- [x] Output under `public/books/paper/<id>/` for sample books (Node bake stand-in)
- [x] `generate-library.js` folds the manifest path into `books.json`
- [x] `<PaperLayer>` in `ReaderView.tsx`, gated on `theme === 'paper'` — PDF canvas + text path
- [x] Ink-variance CSS on the text-render path (TXT char / ghost HTML word)
- [ ] Roll out bake to the rest of the library
- [ ] Photo grain tiles replace `grain.svg`
- [ ] catts `POST /jobs/paperbake`
