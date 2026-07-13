# CatReader Instructions

## Mission
Premium, distraction-free reading. Laconic UX — minimal UI, zero-friction setup.

## Technical Standards
- Logic in `src/hooks/`, not bloating `App.tsx` further.
- Zoom = device-category map: `{ mobile, tablet, desktop }`.
- PDF virtualization (`PDF_RENDER_WINDOW`) stays on.
- Static metadata → `books.json`; user overrides → Firestore / IndexedDB.
- Map: `docs/ARCHITECTURE.md`.

## Workflow
1. Check `agents.md` + `docs/ARCHITECTURE.md`.
2. Plans stay TL;DR.
3. `npm run lint` + `npm test` before push.
4. Bump `APP_VERSION` in `App.tsx`; end responses with that tag.

**v2.9.2**
