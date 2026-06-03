# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm run dev        # Vite dev server at http://localhost:5173 (uses /stac proxy)
npm run build      # tsc typecheck (noEmit) + vite production build into dist/
npm run preview    # serve the production build
```

There is no test suite or linter configured. `npm run build` is the only automated
gate — it runs `tsc` (strict, `noUnusedLocals`/`noUnusedParameters` on) before bundling,
so a build failure is usually a type or unused-symbol error.

## Architecture

Client-only React + TypeScript SPA (no backend) that searches the **Copernicus Data
Space STAC API** (`https://stac.dataspace.copernicus.eu/v1`, STAC v1.0.0 + CQL2).

Data flow is one-directional through three hooks consumed by `App.tsx`, which owns all
shared UI state (selected/hovered item, draw mode, the filter `form`):

- **`hooks/useCollections.ts`** — loads the collection list once at startup and groups it
  by mission for the filter UI.
- **`hooks/useStacSearch.ts`** — owns search results, loading/error state, and pagination.
- **`hooks/useSavedSearches.ts`** — CRUD over `localStorage`.

`api/stac.ts` is the only module that talks to the network. Three things there are easy
to break:

1. **The `/collections` endpoint is paginated** (~383 collections, default page size 10).
   `getCollections` must follow `rel:"next"` links to load them all — don't assume one request.
2. **CORS proxy / URL rewriting.** In dev, `STAC_BASE_URL` is `/stac/v1` and Vite proxies
   it to the real host (see `vite.config.ts`); in prod it's the absolute URL (`config.ts`,
   switched on `import.meta.env.DEV`). STAC `next` links come back as *absolute* URLs to the
   real host, so `rewriteForProxy()` must rewrite them back through `/stac` in dev or
   pagination breaks. Any new pagination-following code must reuse `rewriteForProxy`.
3. **Search pagination is POST-based.** `fetchNext` replays the POST body, honoring the
   link's `method`/`body`/`merge` fields. `useStacSearch` keeps the current request body in
   a ref (`bodyRef`) specifically so `loadMore` can resend it.

### Filter → STAC mapping

`App.tsx#formToParams` converts the UI `FilterForm` into `SearchParams`, then
`api/stac.ts#buildSearchBody` builds the POST body. Mappings: dates → `datetime`
(`from/to`, open ends as `..`); area → `bbox`; missions → `collections[]`; cloud cover →
CQL2 filter via `utils/cql2.ts`. The cloud-cover filter is only sent when an **optical**
collection is selected (`MissionGroup.optical` in `config.ts`); `formToParams` strips it
otherwise, so adding optical collections requires setting that flag in `MISSION_GROUPS`.

### Mission grouping

`config.ts#MISSION_GROUPS` maps collection-id prefixes to human labels and the `optical`
flag. Collections not matching any prefix fall into `OTHER_GROUP`. This is the place to
adjust which satellites get their own group or show the cloud filter.

### Map ↔ list sync

`MapView` (react-map-gl/maplibre) renders result footprints as a GeoJSON source styled by
per-feature `selected`/`hovered` properties, plus a separate bbox source used both for the
confirmed area and the live rubber-band while drawing. Selection/hover state lives in
`App` and is passed to both `MapView` and `ResultList`. Bbox draw mode is a two-click
interaction driven by `drawing` state in `App`.

### Thumbnails

`components/ItemDetail.tsx` exports the shared `thumbnailHref()` / `itemDatetime()`
helpers (also used by `ResultList`). Thumbnails can require Copernicus auth; components
fall back to a placeholder on image error rather than assuming the URL loads.
