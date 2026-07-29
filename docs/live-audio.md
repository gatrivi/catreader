# Live audio (v2.10.9)

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
| `/books/{id}/download` | zip of ready mp3s (attachment) |

- Cassette button when `book.audio` + `cattsBookId` → stream chapters + Download zip.
- Albums: `E:\zengatrivi-drive-e\catts\books\abogen\out\KEEP_*/album`.
- Phone stack: `catts\scripts\start_reader_stack.ps1` → `:3000` CatReader · `:3001` Rosario · `:59200` API.

## Public (Vercel / catreader.gatrivi.com)

Vercel is static — browsers cannot hit Tailscale IPs. Expose CATTS:

```powershell
# from catreader repo (API must be up on :59200)
.\scripts\catts-funnel.ps1
# or: tailscale funnel --bg 59200
```

Then Vercel env:

- `VITE_CATTS_URL=https://<funnel-host>`
- `VITE_CATTS_API_KEY=catts-local`

Redeploy. Without Funnel (or similar HTTPS front door), cassette/DL only work on Tailscale/LAN.
