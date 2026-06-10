# MapExplorer — Executive Summary

**A browser-based portal for searching, previewing, and exporting ESA Copernicus
satellite imagery.** It puts an interactive map and metadata UI in front of the
Copernicus Data Space STAC catalog, so researchers, GIS/remote-sensing professionals,
and ML practitioners can discover Earth-observation data without writing API code.

## At a glance

| | |
|---|---|
| **Type** | Client-only React + TypeScript single-page app (no backend) |
| **Stack** | React 18, TypeScript 5.6 (strict), Vite 5, MapLibre GL 4.7, Tailwind 4 |
| **Data source** | Copernicus Data Space STAC API (STAC v1.0.0 + CQL2), public/no-auth |
| **License** | MIT — no copyleft dependencies; commercial-use & fork safe |
| **Hosting** | Static, GitHub Pages — zero server infrastructure |
| **Size** | ~1,800 lines across 16 source files; only 4 runtime dependencies |
| **Maturity** | v1.0.1 · 16 commits · 1 contributor · repo created 2026-06-03 |
| **Live demo** | https://bbrauzzi.github.io/map-explorer/ |

## What it does

- Filter imagery by **date range, geographic area (draw-on-map bbox), mission, and cloud
  cover**, mapped to STAC `datetime`/`bbox`/`collections`/CQL2 queries.
- **Synchronized map + list** — select/hover an item in either view and it highlights in
  the other; footprints rendered as GeoJSON.
- **Preview & inspect** — quicklook thumbnails, georeferenced map overlay (with Sentinel-1
  SAR geometry handling), and an item-detail modal exposing the full raw STAC JSON.
- **Export** results to GeoJSON/CSV, and **save searches** locally (persisted in the
  browser, synced across tabs).

## Strengths

- **Minimal, modern dependency footprint** (4 runtime deps) → small attack surface, easy
  maintenance.
- **Permissive, clean licensing** (MIT throughout; no GPL/AGPL) → unrestricted commercial
  reuse and redistribution.
- **Strong engineering gates** — TypeScript strict mode, ESLint, unit tests, and a
  multi-step CI pipeline (typecheck → lint → test → build on Node 20 & 22).
- **Zero operational burden** — static SPA, no backend, no secrets, public data only.
- **Focused, well-documented scope** — clear README and architecture notes; the codebase
  does one thing well.

## Risks / watch-items

- **Single contributor / bus factor of 1** and a **very young codebase** (days old) — low
  knowledge distribution, maintenance unproven over time.
- **External-service reliance** — fully dependent on the Copernicus STAC API and on
  CreoDIAS quicklook hosting (a redirect/CORS workaround is in place but fragile).
- **Unit tests only** — good coverage of map interaction and geometry utilities, but no
  integration/end-to-end test of the full search flow.
- **Deployment coupling** — hardcoded `/map-explorer/` base path tied to the repo name;
  English-only (no i18n).

## Bottom line

MapExplorer is a **well-engineered, cleanly-licensed MVP** that solves a real
discovery-UX problem with minimal dependencies and no infrastructure. It is an excellent
candidate for use as a public discovery portal or as a fork/extension base. It is **not
yet de-risked for team-scale or production-critical use** — chiefly because of its single
contributor, very recent origin, and reliance on external services. See `DUE-DILIGENCE.md`
for the full assessment.
