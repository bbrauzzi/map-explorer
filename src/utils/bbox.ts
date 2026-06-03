import type { BBox, GeoJSONGeometry } from '../types/stac'

// MapLibre image-source corner order.
export type ImageCorners = [
  [number, number], // top-left
  [number, number], // top-right
  [number, number], // bottom-right
  [number, number], // bottom-left
]

/** Checks that a bbox is valid (4 numbers, west<east, south<north, in range). */
export function isValidBBox(b?: number[] | null): b is BBox {
  if (!b || b.length !== 4) return false
  const [w, s, e, n] = b
  if ([w, s, e, n].some((v) => typeof v !== 'number' || Number.isNaN(v))) return false
  return w >= -180 && e <= 180 && s >= -90 && n <= 90 && w < e && s < n
}

/** Converts a bbox into a GeoJSON ring (Polygon) for drawing it on the map. */
export function bboxToPolygon(b: BBox): GeoJSON.Feature {
  const [w, s, e, n] = b
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
    },
  }
}

/** Normalizes two corners (lng/lat) into an ordered bbox. */
export function cornersToBBox(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): BBox {
  return [
    Math.min(a.lng, b.lng),
    Math.min(a.lat, b.lat),
    Math.max(a.lng, b.lng),
    Math.max(a.lat, b.lat),
  ]
}

export function formatBBox(b?: BBox): string {
  if (!b) return ''
  return b.map((v) => v.toFixed(4)).join(', ')
}

type LngLat = [number, number]

/** Corners of a bbox in MapLibre image order [TL, TR, BR, BL]. */
function bboxCorners(b: BBox): ImageCorners {
  const [w, s, e, n] = b
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ]
}

/** Extracts the distinct outer-ring corners of a Polygon (drops the closing point). */
function polygonCorners(geometry: GeoJSONGeometry): LngLat[] | null {
  if (geometry.type !== 'Polygon') return null
  const ring = (geometry.coordinates as LngLat[][] | undefined)?.[0]
  if (!ring || ring.length < 4) return null
  // The ring is closed (last point == first); drop it.
  const pts = ring.slice(0, ring.length - 1)
  if (pts.length !== 4) return null
  return pts
}

/**
 * Classifies a footprint's 4 corners into image order [TL, TR, BR, BL] by
 * quadrant around the centroid, assuming a roughly north-up image. Returns null
 * if any quadrant is empty (e.g. a strongly rotated/diamond footprint), in which
 * case the caller should fall back to the axis-aligned bbox.
 */
function classifyNorthUp(pts: LngLat[]): ImageCorners | null {
  const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4
  const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4
  let tl: LngLat | undefined
  let tr: LngLat | undefined
  let br: LngLat | undefined
  let bl: LngLat | undefined
  for (const p of pts) {
    const west = p[0] < cx
    const north = p[1] > cy
    if (north && west) tl = p
    else if (north && !west) tr = p
    else if (!north && !west) br = p
    else bl = p
  }
  // Each corner must fall in a distinct quadrant for a clean quadrilateral.
  if (tl && tr && br && bl) return [tl, tr, br, bl]
  return null
}

export interface OverlayOptions {
  /**
   * The quicklook is in radar acquisition geometry (Sentinel-1 / SAR) rather than
   * north-up. Copernicus SAR footprints list their ring corners in acquisition
   * order — ring[1] is the (first-azimuth, near-range) corner, which is exactly the
   * image's top-left pixel — so the image maps to the ring rotated by one vertex.
   * This tracks ascending vs descending passes automatically (the ring rotates with
   * the orbit). Verified against real ascending & descending Sentinel-1 GRD products.
   */
  sar?: boolean
}

/**
 * Computes the 4 image corners [TL, TR, BR, BL] used to georeference a quicklook
 * onto an item. For SAR (`opts.sar`) the footprint ring is in acquisition order, so
 * the image maps to ring [1, 2, 3, 0]. Otherwise the image is assumed north-up and
 * the corners are classified by quadrant. Falls back to the axis-aligned bbox when
 * the footprint is unusable, and returns null when nothing is usable.
 */
export function overlayCoordinates(
  geometry: GeoJSONGeometry | null | undefined,
  bbox?: number[],
  opts?: OverlayOptions,
): ImageCorners | null {
  const pts = geometry ? polygonCorners(geometry) : null
  if (pts) {
    if (opts?.sar) return [pts[1], pts[2], pts[3], pts[0]]
    const northUp = classifyNorthUp(pts)
    if (northUp) return northUp
  }
  if (isValidBBox(bbox)) return bboxCorners(bbox)
  return null
}
