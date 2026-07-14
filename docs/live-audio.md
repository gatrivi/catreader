# Live audio (v2.9.3)

Headphones in reader → CATTS Tailscale `http://100.87.252.18:59200`.

- Selection → start that sentence; else page start.
- `POST /tts/live` `{text, lang}` → wav; cache IndexedDB `ttsAudio`.
- Env: `VITE_CATTS_URL`, `VITE_CATTS_API_KEY` (optional if CATTS key empty).
- PDF/TXT only. Prefetch depth 1.
