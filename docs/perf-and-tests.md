## Perf notes (v2.9.0)

- PDF: ±8 page render window (`isPageInRenderWindow`) — only nearby pages mount react-pdf.
- Still creates N placeholder wrappers for scroll height (OK for mid-size; large PDFs may lag).
- Library: one shelf visible at a time (carousel); search filters client-side.
- Idle cover/AI enrichment every 10s can spike CPU/network while idle.

## Critical tests

- `utils/reader.test.ts` — clamp, offset, go-to-page parse, render window, search filter
- `utils/routing.test.ts` — deep-link / query open + slug match
- `PageInput.test.tsx` — type page number → navigate
- `LibraryView.test.tsx` — books render + open on click
- `useReaderSync.test.ts` — restore page, setPage, localStorage fallback
- `BookCover.test.tsx` — click opens even unsupported types
