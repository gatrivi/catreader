## CAT READER - Agent Directives

### MISSION
Maintain a sleek, distraction-free PDF/Text reader that synchronizes progress across devices effortlessly.

### CORE GUIDELINES
- **Rich Aesthetics**: The library should feel like a physical wooden rack. The reader must have premium themes (Sepia, Dim, Dark).
- **Continuous Scroll**: PDF rendering must use virtualization (lazy-loading) for high performance.
- **Sync Everything**: All progress (page, zoom, theme) must sync to the cloud (KVDB).
- **No Hassle**: No logins, no complex setups. Just links and books.


## curent
[] ui should be as little intrusive as possible, think kindle ux
[] for starters the library should consist of several shelves like the main one, user should be able to set up a wallpaper or get ia to make one, and title each, to easily sort books. 
[] lets start with 8 shelves, if user wants more we can nest them. see if we can use a nifty animation that doesnt break for that.
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

[] use some sort of open api to find the name and author of the books. allow the user to edit them manually. 
[] same thing for the covers image

[] user should be able to reorganize books in the shelves.
[] when a new feat is pushed it should not destroy reading progress, that is, if i was on page 20, and there is a new push, if it sends me bacak to page one, something messed up


[] after applying changes cleanup refactor, document, then run tests, if there are no breaking changes, push


[] there should be a set of tests for core app functionalities, there should not be pushes if they break the app. lol.

[] zoom should also be preserved beteween session. there should be perhaps one zoom per device type.

[] when scrolling the page number should change


[] implementation plans should really be little more than tldr