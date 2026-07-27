# READER MODE / GHOST TEXT — LAZY OR IT’S BROKEN

```
DO NOT EXTRACT THE WHOLE BOOK UP FRONT.
DO NOT EXTRACT “FIRST 20 PAGES FROM PAGE 1”.
DO NOT BLOCK THE USER ON FULL-BOOK TEXT BUILD.

FEATURE #1 PAGE IS THE ANCHOR.
EXTRACT FROM THE SYNCED CURRENT PAGE OUTWARD (±N),
ONE PAGE (OR ONE SCREEN) AT A TIME, ON DEMAND.

CACHE WHAT YOU TOUCH. NEVER MAKE “MODO LECTOR”
MEAN “WAIT WHILE WE PARSE ALL 400 PAGES”.

WRONG (legacy — fixed v2.10.1):
  pages 1..20 then 21..end → spinner forever on big PDFs.

RIGHT (current):
  need page P → extract P±2 → show → extract as user scrolls.
```

Code: `App.ensureGhostAround` + `src/utils/ghostText.ts` (old `extractGhostTextLazy` name is a thin wrapper).
Progress freeze still applies when text DOM remounts (`docs/PROGRESS_SACRED.md`).
