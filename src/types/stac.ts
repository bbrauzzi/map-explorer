// Minimal types for the STAC entities used in the portal.
// Based on STAC v1.0.0 / OGC API Features (Copernicus Data Space).

export type BBox = [number, number, number, number] // [west, south, east, north]

// Minimal GeoJSON geometry (avoids a dependency on @types/geojson).
export interface GeoJSONGeometry {
  type: string
  coordinates?: unknown
  geometries?: GeoJSONGeometry[]
}

export interface StacLink {
  rel: string
  href: string
  type?: string
  title?: string
  method?: string
  body?: Record<string, unknown>
  merge?: boolean
}

export interface StacAsset {
  href: string
  title?: string
  type?: string
  roles?: string[]
}

export interface StacExtent {
  spatial?: { bbox: number[][] }
  temporal?: { interval: (string | null)[][] }
}

export interface StacCollection {
  id: string
  title?: string
  description?: string
  license?: string
  extent?: StacExtent
  links?: StacLink[]
  'item_assets'?: Record<string, StacAsset>
}

export interface StacItem {
  type: 'Feature'
  id: string
  collection?: string
  geometry: GeoJSONGeometry | null
  bbox?: number[]
  properties: Record<string, unknown> & {
    datetime?: string | null
    'start_datetime'?: string
    'end_datetime'?: string
    'eo:cloud_cover'?: number
    platform?: string
  }
  assets: Record<string, StacAsset>
  links?: StacLink[]
}

export interface StacItemCollection {
  type: 'FeatureCollection'
  features: StacItem[]
  links?: StacLink[]
  numberMatched?: number
  numberReturned?: number
  context?: { matched?: number; returned?: number; limit?: number }
}

// ---- Search parameters used by the app ----

export interface SortBy {
  field: string
  direction: 'asc' | 'desc'
}

export interface SearchParams {
  collections: string[]
  bbox?: BBox
  dateFrom?: string // ISO 8601 or empty
  dateTo?: string
  maxCloudCover?: number // 0-100, undefined = no filter
  limit: number
  sortby?: SortBy
}

export interface SavedSearch {
  id: string
  name: string
  createdAt: string
  params: SearchParams
}
