# Audiobook bake (2026-07-29)

## READY (wired in books.json)

| cattsBookId | book | notes |
|-------------|------|-------|
| KEEP_Cassian_Conferences | Cassian Conferences | full Edge album (23 ch) |
| KEEP_Entering_Jhana | Entering Jhana | |
| KEEP_Right_Concentration | Right Concentration | |
| KEEP_Reality_of_Being | Reality of Being | was mislabeled Salzmann_* |
| KEEP_Core_Teachings | MCTB | was KEEP_MCTB |
| KEEP_Psych_Commentaries | Nicoll Vol1 | was KEEP_Nicoll_Vol1 |

Cassette only when album has ≥1 non-empty mp3. Stream + **Download zip** (`GET /books/{id}/download`).

## Orphans (album exists, not wired)

KEEP_Cassian_Pocket (progressive Edge/Pocket bake), KEEP_Cassian_Conferences_VV, KEEP_Bakeoff_Smoke.

## Names fixed (earlier)

| was | now |
|-----|-----|
| cce_1497 | Pachomius, Saint (Coptic Encyclopedia) |
| Holy-Rosary… | An Essential Guide to the Holy Rosary in Latin |
| Divine Iliad filename | The Message of the Divine Iliad, Vol. II — Walter Russell |
| Secret of Light filename | The Secret of Light — Walter Russell |
| Unravelling… | …Through Abhidhamma — Sayalay Susila |

## Manual

`public/books/_needs-naming/thecompleteascet03liguuoftnew.pdf` — OCR empty (520pp).

## Bake queue (Edge, background)

`E:\zengatrivi-drive-e\catts\scripts\bake_priority_queue.ps1`  
Log: `E:\zengatrivi-drive-e\catts\data\bake_queue.log`  
Promote: `scripts/bake_and_promote_keep.py` → `books/abogen/out/KEEP_*/album`

## Pocket progressive (Cassian)

- KEEP: `KEEP_Cassian_Pocket` (Edge album untouched).
- Bake: `scripts/bake_book_pocket_resume.py` · log `data/abogen/pocket_cassian.log`
- Cassette polls every 20s; play what exists, wait for next.

## Public DL

See `docs/live-audio.md` § Public — Funnel + Vercel `VITE_CATTS_URL`. Mp3s stay on CATTS disk; not in Git/Vercel.
