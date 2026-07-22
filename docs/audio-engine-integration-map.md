# Cat Audio Engine — CatReader integration map (Fase 0)

TLDR: CatReader is Fase 6. Keep live TTS until `@catts/audio-engine` + `AudioManifestV1` ship. Adapter scaffolding lives in `src/audio/`.

## Current code

| Area | Where | Notes |
|------|--------|--------|
| Canonical text | PDF pages / TXT / EPUB CFI | `EpubView`, `useReaderSync` (`page`, `epubCfi`) |
| Book IDs | `books.json` `id` / `filename` | e.g. `gloriesmary00ligugoog.pdf`; `audio: true` flags cassette |
| Live TTS | `useLiveAudio` → `POST /tts/live` | IDB `ttsAudio`; runtime TTS (spec §2 excludes this long-term) |
| Prebake client | `services/catts.ts` | `GET /books`, chapter audio (mpeg blob), SRT |
| SRT cues | `utils/srt.ts` | parse only; no player yet |
| Reading progress | localStorage + KVDB | no per-work audio progress |
| PWA | vite-plugin-pwa | no Media Session for audiobook |

## Adapter (this repo)

| Module | Role |
|--------|------|
| `src/audio/manifest.v1.ts` | Contract types (mirror spec §5) |
| `src/audio/adaptCattsAudiobook.ts` | Legacy `/books` meta → `AudioManifestV1` |
| `src/audio/resolveListenFromHere.ts` | page/CFI → asset + `startAtMs` + match quality |

## Gaps until Fase 6

- No shared headless engine package yet — do not fork.
- No chapter player / queue / download UI.
- Manifest locators mostly synthetic (`block` / chapter) until CatTS emits `pdf-page` / `epub-cfi` + cue `SourceRange`.
- Map library `filename` ↔ CatTS `work.id` still manual.

## Fase 6 order (when engine `0.1.x` exists)

1. Depend on versioned `audio-engine` + React bindings (Yarn).
2. Root `AudioEngineProvider` + single persistent `HTMLAudioElement`.
3. Wire `Escuchar desde aquí` via `resolveListenFromHere` → `playFrom` / queue.
4. Persist audio progress by `workId`; resume by semantic locator on revision change.
5. Retire live headphones path for books that have a manifest.
