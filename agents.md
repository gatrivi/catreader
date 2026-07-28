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
[x] when a new feat is pushed it should not destroy reading progress, that is, if i was on page 20, and there is a new push, if it sends me bacak to page one, something messed up
[x] there should be a set of tests for core app functionalities, there should not be pushes if they break the app. lol.
[x] zoom should also be preserved beteween session. there should be perhaps one zoom per device type.
[x] when scrolling the page number should change

### TASK ARCHIVE
Completed tasks are moved to [completed_tasks.md](file:///c:/zengatrivi/REACTJS/catreader/completed_tasks.md).

### UPCOMING / IDEAS
- [ ] Windows/Android "Default App" integration (PWA / File Handlers) — PWA install exists; OS file handlers not.
- [ ] DOCX support (EPUB already via `EpubView`).
- [ ] Richer annotation / highlighting UX (Firestore hooks exist).
- [ ] Paper Soul: catts bake job + photo grain + remaining library bake.

### DOC MAP
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
**FEATURE #1:** [docs/PROGRESS_SACRED.md](docs/PROGRESS_SACRED.md)
**READER MODE:** [docs/READER_MODE_LAZY.md](docs/READER_MODE_LAZY.md)

### CATTS / PC stack (audiolibros)
- PC repo: `E:\zengatrivi-drive-e\catts` · Tailscale `100.87.252.18`
- Phone: CatReader `http://100.87.252.18:3000` · API `:59200`
- PC: `npm start` / `npm stop` / `npm run stop:heavy` · `.\scripts\start_reader_stack.ps1`
- Cassette: `audio` + `cattsBookId` (ej. Cassian `KEEP_Cassian_Conferences`). See README § CATTS + `docs/live-audio.md`.

---
-tldr all responses.
-review, refactor, cleanup. if tests pass, push.
-dont modify these instructions if possible.

keep a version number always visible in the upper right corneer of the app, and finish each message with it so i can verify  im seeing the correct version

[] please dont fill this file with so much flair it becomes impossible for me to find anything in it. tldr is the policy, yes?

[] after applying changes cleanup refactor, document, then run tests, if there are no breaking changes, push

[] implementation plans should really be little more than tldr

### SESSION CONTEXT (2026-07-14)

- **Version:** `v2.10.7`
- **FEATURE #1 SACRED:** synced reading progress — see `docs/PROGRESS_SACRED.md`. NEVER clobber page on remount.
- **READER MODE:** word→snippet→page→±1 prefetch — `docs/READER_MODE_LAZY.md`.
- Live audio: headphones btn → CATTS `100.87.252.18:59200` `/tts/live`; selection or page start; wav cache IDB `ttsAudio`.
- See `docs/ARCHITECTURE.md`. Paper Soul bake still Node stand-in.

### Known Issues
- DnD: no ghost preview (`opacity-40` only)
- No shelf nesting
- Live audio: EPUB not yet; CATTS must be reachable
- Paper: Node bake stand-in; full library bake + catts job still open
