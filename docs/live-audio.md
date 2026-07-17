# Live audio (v2.9.4)

Headphones in reader → CATTS Tailscale `http://100.87.252.18:59200`.

- Selection → start that sentence; else page start.
- `POST /tts/live` `{text, lang}` → wav; cache IndexedDB `ttsAudio`.
- Env: `VITE_CATTS_URL`, `VITE_CATTS_API_KEY` (optional if CATTS key empty).
- PDF/TXT only. Prefetch depth 1.

## Audiobook library API (pre-baked)

Auth: `X-API-Key` (defaults `catts-local`). CORS *. Client: `src/services/catts.ts`.

| GET | Returns |
|-----|---------|
| `/books` | list `{id,title,status,chapters,has_subtitles}` |
| `/books/{id}` | meta + `chapters_detail[]` (titles/urls) |
| `/books/{id}/chapters/{n}/audio` | audio/mpeg |
| `/books/{id}/chapters/{n}/subtitles` | SRT |

- Fixture ready: `KEEP_The_Secret_of_the_Rosary` (52 ch, subs; 18 SRT stubs).
- SRT → cues: `src/utils/srt.ts` (`parseSrt`, `cueAt`).
- Cassette badge on `BookCover` when `book.audio`.
- Also: `POST /jobs/audiobook` (generate), `POST /tts/speak` (live sentence).
- Start API: `.venv\Scripts\python -m uvicorn api.main:app --host 0.0.0.0 --port 59200`.
- TODO (needs API up): map library book → `audioId`; reader chapter player + subtitle sync.
