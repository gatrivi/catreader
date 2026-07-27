# LibraryView issues

Enum of core problems (2026-07-27). Fixes for 1–3: this sprint.

```
enum LibraryCoreProblem {
  SLOT_OVERFLOW_INVISIBLE = 1,   // 4×4 shows bookIds[0..15] only; >16 vanish (still in storage)
  SPARSE_GRID_VS_DENSE_IDS,      // empty slots ≠ holes; reorder/move splice+append, drop index ignored across shelves
  DELETED_BOOKS_RESURRECT,       // filter deleted → enrichment remaps full books.json → setLibrary brings them back
  PROGRESS_AURA_STUB,            // getReadingProgress ≈ 0 except open book
  SHELVES_LOCAL_ONLY,            // catreader_shelves_v2 localStorage; no cloud sync
  DND_TARGETS_FIRST_3,           // drag targets shelves.slice(0, 3) only
  DND_NO_GHOST,                  // transparent dragImage + opacity fade
  DND_TOUCH_WEAK,                // HTML5 DnD; edge-flip zones md+ only
  RACK_INDEX_UNSAFE,             // shelves[currentRack] unclamped after remove
  ADD_SHELF_STALE_GOTO,          // goToRack(shelves.length) before add commits
  FETCH_DOUBLE_SET_CHURN,        // setLibrary(raw) then setLibrary(enriched) → shelf auto-assign flicker
  IDLE_ENRICH_THRASH,            // 10s idle Gemini/cover scan while on library
  NO_SHELF_NESTING,              // known gap
}
```

**Fixed in sparse-shelf pass:** 1, 2, 3 (+ DnD all-shelf targets / `DND_TARGETS_FIRST_3`, rack clamp / `RACK_INDEX_UNSAFE`).  
**Fixed in v2.9.8:** cover lock + upload retry; pointer drag + ghost; rack chips/swipe; remove-rack toast+jump.  
**Deferred:** `PROGRESS_AURA_STUB`, `SHELVES_LOCAL_ONLY`, nesting, idle enrich thrash.
