# MapExplorer — Due Diligence Report

*Scope: technical, legal (licensing/IP), security, and project-maturity assessment of the
MapExplorer codebase. Neutral and reusable — suitable for an acquirer, a technical adopter
evaluating a fork, or an internal stakeholder reviewing project health. All findings were
verified directly against the repository (`README.md`, `CLAUDE.md`, `package.json`,
`LICENSE`, `src/`, `.github/workflows/`) and git history.*

For a one-page distillation, see `ONE-PAGER.md`.

---

## 1. Overview & purpose

MapExplorer is a **client-only React + TypeScript single-page application** that searches,
browses, previews, and exports satellite imagery from the **ESA Copernicus Data Space
Ecosystem** via its STAC API (STAC v1.0.0 + CQL2). It has no backend of its own.

**Problem it solves.** The Copernicus STAC API is powerful but programmatic — using it
directly means writing a REST client and learning CQL2 query syntax. MapExplorer provides
an interactive map-and-metadata GUI for geographic, temporal, mission, and cloud-cover
filtering, so non-programmers can discover Earth-observation data.

**Target users.** Environmental/climate researchers, GIS and remote-sensing professionals,
agricultural/forestry and disaster-response teams, ML practitioners sourcing training
imagery, and government EO programs.

**Live demo.** https://bbrauzzi.github.io/map-explorer/

---

## 2. Feature inventory

**Search & filtering**
- Date range (from/to, with open-ended `..` support).
- Geographic area via interactive two-click **draw-bbox** on the map, plus manual
  decimal-degree entry, with validation.
- Mission/collection selection across grouped collections (~383 in the catalog), with
  per-group select/deselect.
- Maximum cloud-cover slider — shown only for optical collections, sent as a CQL2 filter.

**Results & map**
- Paginated result list (POST-based pagination preserving filters).
- OpenStreetMap base layer (no API key required) with result footprints as GeoJSON.
- **Bidirectional map↔list sync** for selection and hover state.

**Preview & inspection**
- Quicklook thumbnails (with placeholder fallback on load error).
- Georeferenced quicklook **map overlay** for the selected item, including special handling
  for Sentinel-1 SAR acquisition geometry, with fallback to an axis-aligned bbox.
- Item-detail modal showing acquisition metadata, asset download links, and the full raw
  STAC JSON.

**Export & persistence**
- Export the current result set to **GeoJSON** and **CSV** (Excel-friendly, UTF-8 BOM).
- **Saved searches** stored in browser `localStorage`, synced across tabs via
  `StorageEvent`.

**UI**
- Collapsible filter and results panels; loading and error states throughout.

---

## 3. Architecture

Client-only SPA with a **one-directional data flow** through three hooks consumed by
`src/App.tsx`, which owns the shared UI state (selected/hovered item, draw mode, filter
form):

- `src/hooks/useCollections.ts` — loads the collection list once at startup and groups it
  by mission for the filter UI.
- `src/hooks/useStacSearch.ts` — owns search results, loading/error state, and pagination
  (keeps the request body in a ref so "load more" can replay the POST).
- `src/hooks/useSavedSearches.ts` — CRUD over `localStorage`.

**Network layer.** `src/api/stac.ts` is the only module that talks to the network. Notable
care points (documented in `CLAUDE.md`): the `/collections` endpoint is paginated and must
follow `rel:"next"` links; STAC `next` links return absolute URLs that must be rewritten
back through the dev proxy (`rewriteForProxy`); and search pagination is POST-based,
replaying the body with `method`/`body`/`merge` honored.

**Filter → STAC mapping.** `App.tsx#formToParams` converts the UI form into search params;
`api/stac.ts#buildSearchBody` builds the POST body. Mission grouping and the optical
cloud-cover flag live in `src/config.ts` (`MISSION_GROUPS`).

**Map ↔ list sync.** `src/components/MapView.tsx` (react-map-gl/MapLibre) renders footprints
styled per-feature by `selected`/`hovered` properties plus a bbox source for the confirmed
area and live rubber-band while drawing; selection/hover state is owned by `App` and passed
to both `MapView` and `ResultList`.

---

## 4. Technology stack & dependencies

**Runtime dependencies (4 — minimal footprint):**

| Package | Version | License |
|---|---|---|
| react | ^18.3.1 | MIT |
| react-dom | ^18.3.1 | MIT |
| maplibre-gl | ^4.7.1 | BSD-3-Clause |
| react-map-gl | ^7.1.7 | MIT |

**Dev dependencies** include Vite 5.4 + @vitejs/plugin-react, TypeScript 5.6,
Tailwind CSS 4.3 (@tailwindcss/vite), ESLint 9 (+ react-hooks/react-refresh plugins and
typescript-eslint), and the Vitest 2.1 / jsdom / Testing Library stack.

All dependencies use caret (`^`) versioning, allowing minor/patch updates. A
`package-lock.json` (lockfile v3) is present, pinning the resolved tree for reproducible
installs.

---

## 5. Licensing & IP

- **Project license: MIT** (`LICENSE`, © 2026 bbrauzzi).
- **All major dependencies are permissive:** React/react-dom/react-map-gl/Vite/Tailwind/
  ESLint/Vitest (MIT), MapLibre GL (BSD-3-Clause), TypeScript (Apache-2.0).
- **No GPL/AGPL or other copyleft dependencies** were found.

**Conclusion.** Licensing is clean and commercial-friendly. The project may be forked,
modified, relicensed, redistributed, and sold under MIT terms (with attribution). No
copyleft obligations or proprietary/restricted licenses apply.

---

## 6. External service dependencies

**Copernicus Data Space STAC API** — `https://stac.dataspace.copernicus.eu/v1`
- Operations used: `GET /collections` (paginated) and `POST /search` (CQL2 filter, bbox,
  datetime range, cloud cover, `sortby` datetime desc), plus pagination links.
- **No authentication** required for browse/search; data is public. The API returns
  `Access-Control-Allow-Origin: *`, so the browser calls it directly in production.
- No explicit client-side rate limiting. (Downloading actual raster bytes would require
  Copernicus credentials, which is out of scope for this discovery portal.)

**CreoDIAS quicklook thumbnails** — `datahub.creodias.eu` → `zipper.creodias.eu`
- The thumbnail host issues a 301 redirect, and CORS headers are present only on the final
  response. Handled via a Vite dev proxy (`/thumb`, `followRedirects: true`) and a
  production URL rewrite to hit `zipper.creodias.eu` directly (`MapView.tsx`).
- **Fragility note:** if CreoDIAS changes its redirect behavior or gates the image host
  behind auth, thumbnails break. A reverse-proxy/edge-worker fallback would mitigate this.

---

## 7. Security & privacy

- **No backend** — fully client-side SPA. No server-side rendering, API server, or database;
  therefore no server-side injection/auth-bypass surface. The Vite proxy is **dev-only** and
  is not part of the production deployment.
- **No authentication** and **no secrets in the repo** — no API keys/tokens in source;
  `.env*` is gitignored; all STAC requests are unsigned/public.
- **Data storage** — saved searches live in browser `localStorage`
  (`mapexplorer.savedSearches.v1`); contents are serialized search parameters only, never
  transmitted to any server. No personal or sensitive data is handled.
- **Input validation** — bbox coordinates are validated (`src/utils/bbox.ts`, well tested);
  search parameters are JSON-serialized (no injection vector).
- **Rendering** — React's JSX escaping protects displayed text. Thumbnail/asset URLs from
  STAC metadata are not pre-validated; a malicious image URL would simply fail to load
  (handled by an `onError` fallback). Low residual XSS risk.

**Assessment: LOW risk.** **Recommendation:** if user accounts or data downloads are ever
added, use OAuth 2.0 / secure cookies rather than `localStorage` for any credentials, and
sanitize/validate any metadata used in URL attributes.

---

## 8. Code quality & testing

- **TypeScript strict mode** is enabled (`tsconfig.json`: `strict`, `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`). No `any` usage
  observed.
- **Clean, modular organization** — ~1,800 lines across 16 source files, split into
  `api/`, `components/`, `hooks/`, `utils/`, and `types/`. No `TODO`/`FIXME`/`HACK` markers
  found.
- **Tests** — Vitest + Testing Library with two suites: `src/components/MapView.test.tsx`
  (toolbar, selection/hover, bbox drawing, overlay logic) and `src/utils/bbox.test.ts`
  (validation/transform/classification), ~32 assertions total.
  - **Gap:** unit-level only; no integration/end-to-end test of the full search flow against
    a mocked STAC API.
- **Lint & build gate** — ESLint 9 (flat config) and `npm run build` = `tsc && vite build`,
  so the build fails on any type or unused-symbol error.

**Assessment: HIGH** on type safety, organization, and lint/CI discipline; the main quality
gap is the absence of integration/E2E coverage.

---

## 9. Build, CI/CD & deployment

- **Build:** `npm run build` runs `tsc` (typecheck, no emit) then `vite build` into `dist/`,
  with base path `/map-explorer/` for GitHub Pages.
- **CI** (`.github/workflows/ci.yml`): on push to main/develop and on PRs; matrix Node 20 &
  22; runs typecheck → lint → test → build. Concurrency cancels stale runs.
- **Release** (`.github/workflows/release.yml`): manual `workflow_dispatch`; re-runs the full
  gate, deploys `dist/` to GitHub Pages, creates an idempotent version tag/release from
  `package.json`, and merges develop → main. Minimal, scoped permissions.
- **Hosting:** static files on GitHub Pages — no containers, no infrastructure, no secrets.

---

## 10. Project maturity & history

| Metric | Value |
|---|---|
| Version | 1.0.1 |
| Total commits | 16 |
| Contributors | 1 (bbrauzzi) |
| First commit | 2026-06-03 |
| Latest commit | 2026-06-04 |
| Branches | develop (default), main, plus feature/chore branches |

**Assessment: early-stage.** Semantic versioning and a polished CI/CD setup signal intent
for broader use, but the codebase is only days old with a single author — strong gates that
have not yet been exercised over a real maintenance cycle.

---

## 11. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Single contributor** (bus factor of 1) | Medium | Add contributor/onboarding docs; distribute knowledge; second maintainer. |
| 2 | **Very new codebase** (days old) | Medium | Allow a maintenance track record to accumulate; tag a stable release line. |
| 3 | **Reliance on Copernicus STAC API** availability | Medium | Abstracted in `api/stac.ts`; consider multi-catalog support / graceful degradation. |
| 4 | **CreoDIAS thumbnail redirect/CORS fragility** | Low–Medium | Add a reverse-proxy/edge-worker fallback for quicklooks. |
| 5 | **No integration/E2E tests** | Medium | Add a mocked-STAC end-to-end test of the search flow. |
| 6 | **Hardcoded `/map-explorer/` base path** tied to repo name | Low | Parameterize base path via env/config if repo or hosting changes. |
| 7 | **Stale CLAUDE.md note** ("no test suite or linter") | Low | Update the doc — tests and ESLint now exist. |
| 8 | **No i18n** (English only; originally Italian) | Low | Extract strings to a translation layer if multilingual support is needed. |
| 9 | **Collections pagination capped at 50 pages** | Low | Adequate for ~383 collections; raise/remove cap if the catalog grows substantially. |

---

## 12. Recommendations

1. **Reduce bus factor** — add `CONTRIBUTING`/onboarding docs and ideally a second
   maintainer; enable branch protection requiring PR review on `main`/`develop`.
2. **Add integration/E2E tests** covering the full search → results → export flow against a
   mocked STAC API.
3. **Harden external-service handling** — add a fallback path for CreoDIAS thumbnails and
   consider supporting alternate STAC catalogs (e.g., Earth Search, Planetary Computer) given
   the clean `api/stac.ts` abstraction.
4. **Fix documentation drift** — update the stale CLAUDE.md note about tests/linting.
5. **Decouple deployment** — parameterize the GitHub Pages base path so the project isn't
   tied to the exact repo name.
6. **Plan i18n** if a non-English audience is targeted; the string surface is small enough to
   migrate cleanly.

---

## 13. Summary assessment

| Category | Finding | Risk |
|---|---|---|
| Dependencies | 4 runtime deps, all MIT/BSD; locked & current | Low |
| Licensing & IP | MIT throughout; no copyleft; commercial-safe | Low |
| External services | Public Copernicus STAC (no auth) + CreoDIAS thumbnails | Low–Medium |
| Security & privacy | No backend/auth/secrets; public data; localStorage only | Low |
| Code quality | Strict TS, modular, zero TODO debt | Low |
| Testing | Solid unit tests; no integration/E2E | Medium |
| Build/CI/CD | Multi-step CI + manual release; static hosting | Low |
| Maturity | v1.0.1, 16 commits, 1 contributor, days old | Medium |

**Overall: LOW technical/legal risk, MEDIUM organizational/maturity risk.** MapExplorer is
a well-engineered, cleanly-licensed, low-footprint MVP that is safe to adopt, fork, and
extend. The reservations are organizational (single contributor, very recent origin) and
operational (external-service dependence, no integration tests) rather than defects in the
code itself.
