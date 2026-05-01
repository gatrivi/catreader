## CAT READER - Agent Directives

### MISSION
Maintain a sleek, distraction-free PDF/Text reader that synchronizes progress across devices effortlessly.

### CORE GUIDELINES
- **Rich Aesthetics**: The library should feel like a physical wooden rack. The reader must have premium themes (Sepia, Dim, Dark).
- **Continuous Scroll**: PDF rendering must use virtualization (lazy-loading) for high performance.
- **Sync Everything**: All progress (page, zoom, theme) must sync to the cloud (KVDB).
- **No Hassle**: No logins, no complex setups. Just links and books.

---

## curent
[x] ui should be as little intrusive as possible, think kindle ux
[x] for starters the library should consist of several shelves like the main one, user should be able to set up a wallpaper or get ia to make one, and title each, to easily sort books.
[x] lets start with 8 shelves, if user wants more we can nest them. see if we can use a nifty animation that doesnt break for that.
[x] user should be able to reorganize books in the shelves.
[x] use some sort of open api to find the name and author of the books. allow the user to edit them manually.
[x] same thing for the covers image
[] when a new feat is pushed it should not destroy reading progress, that is, if i was on page 20, and there is a new push, if it sends me bacak to page one, something messed up
[] there should be a set of tests for core app functionalities, there should not be pushes if they break the app. lol.
[] zoom should also be preserved beteween session. there should be perhaps one zoom per device type.
[x] when scrolling the page number should change

### TASK ARCHIVE
Completed tasks are moved to [completed_tasks.md](file:///c:/zengatrivi/REACTJS/catreader/completed_tasks.md).

### UPCOMING / IDEAS
- [ ] Windows/Android "Default App" integration (PWA / File Handlers).
- [ ] EPUB / DOCX support.
- [ ] Annotation / Highlighting sync.

---
-tldr all responses.
-review, refactor, cleanup. if tests pass, push.
-dont modify these instructions if possible.

keep a version number always visible in the upper right corneer of the app, and finish each message with it so i can verify  im seeing the correct version

[] please dont fill this file with so much flair it becomes impossible for me to find anything in it. tldr is the policy, yes?

[] after applying changes cleanup refactor, document, then run tests, if there are no breaking changes, push

[] implementation plans should really be little more than tldr

---

## SESSION CONTEXT (2026-05-01)

### What Was Done
- **Reliable page tracking:** scroll-based center calculation + IntersectionObserver with intersection-ratio picking. Page number now trustworthy during continuous scroll.
- **Render trust cues:** per-page loading spinner, 15s timeout → error state, subtle page-number watermark on every wrapper so blank pages are identifiable.
- **Document error handling:** `onLoadError` shows clear "Failed to load PDF" message instead of silent failure.
- **Cleanup:** removed dead `quadrant` state and scroll logic.
- **Library furniture layout:** shelves grouped into horizontal bookcases (2 shelves per case). Swipe/scroll sideways between cases. No more infinite vertical wall.
- **Edit discoverability:** book cover action buttons (edit/share) now live inside the cover top-right, always visible on touch, hover-reveal on desktop.
- **Version:** `v1.3.7`

### Architecture Notes
- App.tsx is **1,300+ lines** — the monolith is the biggest tech debt. Extract hooks/logic before adding major features.
- Books are auto-assigned to shelves round-robin on first load. Unassigned books get distributed to the emptiest shelf.
- Shelf data model: `{ id, title, bookIds: string[] }`. Book IDs are filenames from `books.json`.
- `useShelves` depends on `library` being loaded first — it only runs distribution after `initialized === true`.

### Known Issues / Next UX Tasks
- No click-outside handler for the More menu (minor)
- Drag-and-drop has no visual "ghost" preview — books just go transparent (`opacity-40`)
- No shelf nesting yet — user asked to "see if we can nest them" later
- Tests exist (`BookCover.test.tsx`, `syncService.test.ts`) but are not comprehensive
