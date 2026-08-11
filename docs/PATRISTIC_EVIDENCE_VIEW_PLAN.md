# Patristic Evidence View — Plan

Status: planned. No quotations have been curated yet.

## Goal

Create a `/evidence` view showing early-Christian evidence for:

- Sacrifice of the Mass
- Transubstantiated Eucharist
- Faith with works
- Roman papacy
- Apostolic succession
- Purgatory
- Confession to priests
- Infant baptism
- Sinless Mary
- Perpetual virginity of Mary
- Assumption
- Mary as the New Eve
- Original sin

## Evidence entry

Each entry should contain:

- doctrine and author
- concise statement
- exact quotation
- work, chapter/section, and page where available
- translation/edition
- linked CatReader book and locator
- source URL, if available
- context or confidence note

Paraphrases must be labeled as paraphrases. Disputed, pseudonymous, or development-sensitive claims must be marked rather than presented as exact later formulations.

## View behavior

- Search by doctrine, Father, or work.
- Filter by doctrine or author.
- Expand an entry to reveal the quotation and citation.
- `Open in book` navigates to the PDF page, EPUB CFI/chapter, or TXT offset.
- Missing books show an install/source state instead of a dead link.
- Shareable doctrine URLs are optional.

## Implementation

Reuse:

- `ReadingFeedItem` and `FeedLocator`
- `buildBookPath`
- `ReaderView` / `EpubView`
- existing highlight and share behavior
- existing progress guards

Opening evidence must never overwrite saved reading progress.

## Delivery phases

1. Curated static dataset, evidence view, and PDF links.
2. EPUB/TXT locators, search/filter, and shareable URLs.
3. User annotations, corrections, synced notes, and source verification.

## Required tests

- Every entry has a doctrine, author, quotation, and citation.
- Linked books resolve when installed.
- Locators open the intended location.
- Missing books have a clear fallback.
- Evidence navigation preserves reading progress.

## Prerequisite

The quotations, editions, translations, and locators must be curated and verified before implementation. The app can present and navigate evidence; it should not invent quotations.
