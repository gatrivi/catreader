# READER MODE / GHOST TEXT — LAZY OR IT’S BROKEN

```
DO NOT EXTRACT THE WHOLE BOOK UP FRONT.
DO NOT EXTRACT “FIRST 20 PAGES FROM PAGE 1”.
DO NOT BLOCK THE USER ON FULL-BOOK TEXT BUILD.
DO NOT WAIT FOR THREE FULL PAGES BEFORE SHOWING TEXT.

FEATURE #1 PAGE IS THE ANCHOR.

PROCEDURAL PIPELINE (v2.10.2+):
  1. FIRST WORD on synced page P  → paint immediately (draft)
  2. SNIPPET (~sentence) on P     → paint
  3. FULL semantic HTML for P     → paint + cache
  4. PREFETCH ±1 in background    → never blocks P

CACHE WHAT YOU TOUCH.
WORD → SNIPPET → PAGE → NEIGHBOR.
NEVER THE OTHER WAY AROUND.
```

Code: `App.ensureGhostAround` + `src/utils/ghostText.ts`
(`firstWordHtml` → `snippetHtml` → `parsePdfPageSemantically` → prefetch).
Progress freeze: `docs/PROGRESS_SACRED.md`.
