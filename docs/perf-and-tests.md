## Perf notes (v2.9.2)

- PDF: ±8 page render window (`isPageInRenderWindow`) — only nearby pages mount react-pdf.
- Still creates N placeholder wrappers for scroll height (OK for mid-size; large PDFs may lag).
- Library: one rack visible at a time (carousel); search filters client-side.
- Idle cover/AI enrichment every 10s can spike CPU/network while idle.
- Paper Soul: stain prefetch via `usePaperTexture`; grain SVG cached; ink CSS once.

## Critical tests

- `utils/reader.test.ts` — clamp, offset, go-to-page parse, render window, search filter
- `utils/routing.test.ts` — deep-link / query open + slug match
- `utils/paperSoul.test.ts` — stain opacity / page pick / ink wrappers
- `PageInput.test.tsx` — type page number → navigate
- `LibraryView.test.tsx` — books render + open on click
- `useReaderSync.test.ts` — restore page, setPage, zoom map, localStorage fallback
- `syncService.test.ts` — progress / metadata helpers
- `BookCover.test.tsx` — click opens even unsupported types
