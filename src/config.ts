// STAC endpoint configuration and grouping of collections by mission.

// In development we go through the Vite proxy (/stac -> stac.dataspace.copernicus.eu)
// to avoid CORS issues. In production we use the absolute URL.
export const STAC_BASE_URL = import.meta.env.DEV
  ? '/stac/v1'
  : 'https://stac.dataspace.copernicus.eu/v1'

// The real, absolute STAC endpoint. Used for generated code snippets (copy as
// code), which must be runnable outside the app — the dev proxy path (/stac/v1)
// would not resolve elsewhere.
export const STAC_PUBLIC_URL = 'https://stac.dataspace.copernicus.eu/v1'

// Number of results requested per page from the API.
export const PAGE_LIMIT = 50

export const LS_KEY_SAVED_SEARCHES = 'mapexplorer.savedSearches.v1'

// Definition of known missions/satellites, with the prefix used to match the
// STAC collections that belong to them. The actual collections are still loaded
// at runtime from /collections: this only serves to group and label them in a
// readable way in the filter panel.
export interface MissionGroup {
  key: string
  label: string
  // prefixes (case-insensitive) used to associate collections with this mission
  prefixes: string[]
  optical: boolean // if true, show the cloud cover filter
}

export const MISSION_GROUPS: MissionGroup[] = [
  { key: 'sentinel-1', label: 'Sentinel-1 (SAR)', prefixes: ['sentinel-1'], optical: false },
  { key: 'sentinel-2', label: 'Sentinel-2 (optical)', prefixes: ['sentinel-2'], optical: true },
  { key: 'sentinel-3', label: 'Sentinel-3', prefixes: ['sentinel-3'], optical: true },
  { key: 'sentinel-5p', label: 'Sentinel-5P', prefixes: ['sentinel-5p', 'sentinel-5'], optical: false },
  { key: 'sentinel-6', label: 'Sentinel-6 (altimetry)', prefixes: ['sentinel-6'], optical: false },
  { key: 'ccm-optical', label: 'Copernicus Contributing Missions — Optical', prefixes: ['ccm-optical'], optical: true },
  { key: 'ccm-sar', label: 'Copernicus Contributing Missions — SAR', prefixes: ['ccm-sar'], optical: false },
  { key: 'clms', label: 'CLMS (Land Monitoring)', prefixes: ['clms'], optical: false },
]

export const OTHER_GROUP: MissionGroup = {
  key: 'other',
  label: 'Other collections',
  prefixes: [],
  optical: false,
}

export function groupForCollectionId(id: string): MissionGroup {
  const lower = id.toLowerCase()
  for (const g of MISSION_GROUPS) {
    if (g.prefixes.some((p) => lower.startsWith(p))) return g
  }
  return OTHER_GROUP
}
