# CatReader

Distraction-free PDF / EPUB / TXT reader. Progress syncs across devices (Firebase). No login required (anonymous + optional portable profile).

**Version:** see badge in app UI (`APP_VERSION` in `src/App.tsx`) — currently **v2.9.2**.

## Docs map

| Doc | What |
|-----|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full app map (start here) |
| [docs/reader-themes.md](docs/reader-themes.md) | Themes + Modo lector |
| [docs/paper-soul-implementation-plan.md](docs/paper-soul-implementation-plan.md) | Paper theme bake/render |
| [docs/perf-and-tests.md](docs/perf-and-tests.md) | Perf notes + test list |
| [agents.md](agents.md) | Agent directives / backlog |
| [completed_tasks.md](completed_tasks.md) | Shipped features archive |

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
npm test
npm run lint
```

Drop books into `public/books/` (`.pdf` / `.epub` / `.txt`). `predev`/`prebuild` runs `scripts/generate-library.js` → `public/books.json`.

Optional:

```bash
npm run enrich              # Gemini OCR + SVG covers
npm run paper-bake -- file.pdf
```

Env: copy `.env.example` → `.env` (`VITE_GEMINI_API_KEY`, Firebase config via `firebase-applet-config.json`).

## Deploy

Static Vite site (`npm run build` → `dist`). Works on Vercel/Netlify. Books must be in `public/books/` so they ship with the build (PWA caches PDFs at runtime; not precached).

## Features (current)

- Paged library: 4×4 racks, DnD, 8 shelves, wallpaper, `/` search
- Continuous PDF scroll with ±8 page virtualization
- EPUB + TXT; PDF “Modo lector” (ghost text)
- Themes: light / sepia / **paper** / dim / dark
- Zoom per device class (mobile / tablet / desktop)
- Deep links + share URLs
- Google Drive pick/upload
- Cover edit: Google Books / AI / paste / page crop
