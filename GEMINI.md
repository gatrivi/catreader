# CatReader Instructions

## Mission
Maintain a premium, distraction-free reading experience. "Laconic UX" is the priority—minimal UI, zero-friction setup.

## Technical Standards
- **Modular Hooks:** Logic belongs in `src/hooks/`, not `App.tsx`.
- **Zoom Logic:** Always treat zoom as a device-category map: `{ mobile, tablet, desktop }`.
- **Performance:** Never disable PDF virtualization; keep the 3-page buffer for smooth scrolling.
- **Metadata:** Prefer `books.json` for static data and Firestore for user-specific overrides.

## Workflow
1. **Research:** Check `agents.md` and `completed_tasks.md`.
2. **Strategy:** Keep implementation plans TL;DR.
3. **Validation:** Run `npm run lint` and `npm test` before any push.
4. **Version:** Always increment version in `App.tsx` and end responses with the current version tag.

**v2.6.8**
