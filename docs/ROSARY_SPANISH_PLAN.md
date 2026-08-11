# Rosary + Spanish plan

TLDR: make the rosary path useful first, then expand Spanish coverage slowly and safely.

## Value

- High value if the app becomes a structured rosary learner, not just a translated library.
- Lower value if we only add bulk machine translation without review, glossary control, or progress scaffolding.
- Best fit: one rosary flow with short lessons, prayers, and readings in Spanish, plus optional audio.

## Rollout

1. Ship a narrow rosary learning path first.
   - one mystery set
   - one lesson per step
   - source text always preserved
   - Spanish text shown as the primary reading view

2. Add a translation layer with tiers.
   - tier 0: original Spanish text
   - tier 1: human-reviewed Spanish
   - tier 2: Argos draft from local endpoint
   - tier 3: source text only, if translation is missing or low confidence

3. Expand slowly.
   - prayers first
   - short teaching cards next
   - longer book passages last
   - never replace a working source with unverified translation

4. Add review and cache rules.
   - cache by source hash + target language + glossary version
   - show translation provenance in the UI
   - keep review flags visible until approved

## Fallbacks

- If Argos is unavailable, keep the original text and mark translation pending.
- If Spanish TTS is unavailable, stay text-only rather than silently switching accents.
- If a segment is uncertain, prefer source text over a bad translation.

## Endpoint shape

`POST /translate`

Request:

```json
{ "text": "...", "source": "en", "target": "es", "format": "plain" }
```

Response:

```json
{ "translation": "...", "engine": "argos", "sourceHash": "...", "warnings": [] }
```

## What I would build first

- a single rosary path in Spanish
- a small glossary for stable Catholic terms
- a local Argos endpoint for draft translation
- a review queue before anything is promoted to public text

