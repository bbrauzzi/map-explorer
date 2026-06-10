import { useCallback, useEffect, useMemo, useState } from 'react'
import Map, { Layer, Source, type ErrorEvent, type MapLayerMouseEvent } from 'react-map-gl/maplibre'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import { cogProtocol } from '@geomatico/maplibre-cog-protocol'
import type { BBox, StacItem } from '../types/stac'
import { bboxToPolygon, cornersToBBox, overlayCoordinates, type ImageCorners } from '../utils/bbox'
import { cogAssets, thumbnailHref } from './ItemDetail'
import TimeSlider from './TimeSlider'

// Register the cog:// protocol once so raster sources can stream Cloud-Optimized
// GeoTIFFs client-side (geotiff.js). Guarded for HMR / repeated imports.
let cogRegistered = false
if (!cogRegistered) {
  cogRegistered = true
  try {
    maplibregl.addProtocol('cog', cogProtocol)
  } catch {
    /* already registered */
  }
}

// Builds a single-raster map style (no token or paid services required).
function rasterStyle(id: string, tiles: string[], attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: { [id]: { type: 'raster', tiles, tileSize: 256, attribution } },
    layers: [{ id, type: 'raster', source: id }],
  }
}

// Selectable base maps, all key-free.
const BASE_MAPS: { key: string; label: string; style: StyleSpecification }[] = [
  {
    key: 'streets',
    label: 'Streets',
    style: rasterStyle('osm', ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'], '© OpenStreetMap contributors'),
  },
  {
    key: 'satellite',
    label: 'Satellite',
    style: rasterStyle(
      'esri',
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
    ),
  },
  {
    key: 'light',
    label: 'Light',
    style: rasterStyle(
      'carto-light',
      ['a', 'b', 'c'].map((s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`),
      '© OpenStreetMap contributors © CARTO',
    ),
  },
  {
    key: 'dark',
    label: 'Dark',
    style: rasterStyle(
      'carto-dark',
      ['a', 'b', 'c'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`),
      '© OpenStreetMap contributors © CARTO',
    ),
  },
]

interface Props {
  items: StacItem[]
  bbox?: BBox
  selectedIds: Set<string>
  hoveredId: string | null
  drawing: boolean
  onSelect: (item: StacItem) => void
  onHover: (id: string | null) => void
  onBBoxDrawn: (bbox: BBox) => void
  onDrawingChange: (drawing: boolean) => void
}

type Corner = { lng: number; lat: number }

// Quicklook URLs point at datahub.creodias.eu, which 301-redirects to the same
// path on zipper.creodias.eu. The redirect response carries no CORS header, so a
// cross-origin WebGL texture fetch fails on the redirect hop even though the final
// zipper response is CORS `*`. In dev we proxy via /thumb (followRedirects); in prod
// we rewrite straight to zipper to skip the redirect.
function thumbForMap(href: string): string {
  try {
    const u = new URL(href, window.location.origin)
    if (u.hostname.endsWith('creodias.eu')) {
      if (import.meta.env.DEV) return `/thumb${u.pathname}${u.search}`
      if (u.hostname === 'datahub.creodias.eu') {
        u.hostname = 'zipper.creodias.eu'
        return u.toString()
      }
    }
    return href
  } catch {
    return href
  }
}

// SAR quicklooks are stored in radar acquisition geometry (not north-up), which
// changes how the image maps onto the footprint corners — see overlayCoordinates.
function isSarItem(it: StacItem): boolean {
  if ((it.collection || '').toLowerCase().startsWith('sentinel-1')) return true
  if (String(it.properties?.platform || '').toLowerCase().startsWith('sentinel-1')) return true
  return Object.keys(it.properties || {}).some((k) => k.startsWith('sar:'))
}

export default function MapView({
  items,
  bbox,
  selectedIds,
  hoveredId,
  drawing,
  onSelect,
  onHover,
  onBBoxDrawn,
  onDrawingChange,
}: Props) {
  // Bbox drawing: first corner + "live" corner while moving the mouse.
  const [firstCorner, setFirstCorner] = useState<Corner | null>(null)
  const [liveCorner, setLiveCorner] = useState<Corner | null>(null)

  // Whether to overlay the selected items' quicklooks on the map.
  const [showImagery, setShowImagery] = useState(true)

  // Selected base map.
  const [baseMapKey, setBaseMapKey] = useState(BASE_MAPS[0].key)
  const baseStyle = useMemo(
    () => (BASE_MAPS.find((b) => b.key === baseMapKey) ?? BASE_MAPS[0]).style,
    [baseMapKey],
  )

  // Timeline animation: when on, footprints/overlays are restricted to the ids
  // acquired up to the current slider position (owned by TimeSlider).
  const [timeline, setTimeline] = useState(false)
  const [timeWindowIds, setTimeWindowIds] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (!timeline) setTimeWindowIds(null)
  }, [timeline])

  // Items visible given the (optional) time window.
  const visibleItems = useMemo(
    () => (timeline && timeWindowIds ? items.filter((it) => timeWindowIds.has(it.id)) : items),
    [items, timeline, timeWindowIds],
  )

  // Full-res COG overlay: only offered when exactly one item is selected.
  const singleSelectedId = selectedIds.size === 1 ? [...selectedIds][0] : null
  const singleSelected = useMemo(
    () => (singleSelectedId ? items.find((it) => it.id === singleSelectedId) : undefined),
    [singleSelectedId, items],
  )
  const cogs = useMemo(() => (singleSelected ? cogAssets(singleSelected) : []), [singleSelected])
  const [cogAssetKey, setCogAssetKey] = useState<string | null>(null)
  const [cogError, setCogError] = useState(false)
  // Reset the COG choice when the selection changes or imagery is toggled off.
  useEffect(() => {
    setCogAssetKey(null)
    setCogError(false)
  }, [singleSelectedId, showImagery])

  const activeCogHref = useMemo(() => {
    if (!showImagery || !cogAssetKey || cogError) return null
    return cogs.find((c) => c.key === cogAssetKey)?.href ?? null
  }, [showImagery, cogAssetKey, cogError, cogs])

  const handleMapError = useCallback(
    (e: ErrorEvent) => {
      if (!activeCogHref) return
      const srcId = (e as unknown as { sourceId?: string }).sourceId
      const msg = e.error?.message ?? ''
      // The cog:// load failed (commonly auth/CORS) — fall back to the quicklook.
      if (srcId === 'cog-overlay' || /cog:|geotiff|tiff/i.test(msg) || msg.includes(activeCogHref)) {
        setCogError(true)
        setCogAssetKey(null)
      }
    },
    [activeCogHref],
  )

  // Georeferenced quicklook overlays, one per selected item (with a thumbnail
  // and a usable footprint/bbox). Suppressed while a COG overlay is active.
  const overlays = useMemo(() => {
    if (!showImagery || selectedIds.size === 0 || activeCogHref) return []
    return visibleItems
      .filter((it) => selectedIds.has(it.id))
      .map((it) => {
        const href = thumbnailHref(it)
        const coords = overlayCoordinates(it.geometry, it.bbox, { sar: isSarItem(it) })
        if (!href || !coords) return null
        return { id: it.id, url: thumbForMap(href), coordinates: coords }
      })
      .filter(Boolean) as { id: string; url: string; coordinates: ImageCorners }[]
  }, [showImagery, selectedIds, visibleItems, activeCogHref])

  // FeatureCollection of the result footprints.
  const footprints = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: visibleItems
        .filter((it) => it.geometry)
        .map((it) => ({
          type: 'Feature' as const,
          id: it.id,
          properties: { id: it.id, selected: selectedIds.has(it.id), hovered: it.id === hoveredId },
          geometry: it.geometry as GeoJSON.Geometry,
        })),
    }),
    [visibleItems, selectedIds, hoveredId],
  )

  // Bbox preview: either confirmed or while drawing.
  const bboxPreview = useMemo(() => {
    if (drawing && firstCorner && liveCorner) {
      return { type: 'FeatureCollection' as const, features: [bboxToPolygon(cornersToBBox(firstCorner, liveCorner))] }
    }
    if (bbox) return { type: 'FeatureCollection' as const, features: [bboxToPolygon(bbox)] }
    return { type: 'FeatureCollection' as const, features: [] }
  }, [drawing, firstCorner, liveCorner, bbox])

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (drawing) {
        const corner = { lng: e.lngLat.lng, lat: e.lngLat.lat }
        if (!firstCorner) {
          setFirstCorner(corner)
          setLiveCorner(corner)
        } else {
          onBBoxDrawn(cornersToBBox(firstCorner, corner))
          setFirstCorner(null)
          setLiveCorner(null)
          onDrawingChange(false)
        }
        return
      }
      // Select the clicked footprint.
      const feat = e.features?.find((f) => f.layer.id === 'footprints-fill')
      if (feat) {
        const id = feat.properties?.id as string
        const item = items.find((it) => it.id === id)
        if (item) onSelect(item)
      }
    },
    [drawing, firstCorner, items, onBBoxDrawn, onDrawingChange, onSelect],
  )

  const handleMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      if (drawing && firstCorner) {
        setLiveCorner({ lng: e.lngLat.lng, lat: e.lngLat.lat })
        return
      }
      if (!drawing) {
        const feat = e.features?.find((f) => f.layer.id === 'footprints-fill')
        onHover((feat?.properties?.id as string) ?? null)
      }
    },
    [drawing, firstCorner, onHover],
  )

  const cancelDraw = useCallback(() => {
    setFirstCorner(null)
    setLiveCorner(null)
    onDrawingChange(false)
  }, [onDrawingChange])

  return (
    <div className="relative col-start-2 row-start-2">
      <div className="absolute top-[10px] left-[10px] z-[5] flex items-center gap-2 rounded-md border border-border bg-bg/85 px-2.5 py-1.5 text-xs">
        {drawing ? (
          <>
            <span>{firstCorner ? 'Click the second corner' : 'Click the first corner of the area'}</span>
            <button onClick={cancelDraw}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => onDrawingChange(true)}>✏️ Draw area</button>
            <button
              className={showImagery ? 'border-accent text-accent' : ''}
              title="Show the selected item's quicklook on the map"
              onClick={() => setShowImagery((v) => !v)}
            >
              🛰 Imagery {showImagery ? 'on' : 'off'}
            </button>
            <button
              className={timeline ? 'border-accent text-accent' : ''}
              title="Animate the results over their acquisition dates"
              onClick={() => setTimeline((v) => !v)}
            >
              ⏱ Timeline {timeline ? 'on' : 'off'}
            </button>
            {showImagery && cogs.length > 0 && (
              <select
                title="Render a full-resolution COG asset (best-effort) instead of the quicklook"
                value={cogAssetKey ?? ''}
                onChange={(e) => {
                  setCogError(false)
                  setCogAssetKey(e.target.value || null)
                }}
              >
                <option value="">Preview (quicklook)</option>
                {cogs.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}
            {cogError && (
              <span className="text-[#d29922]">
                Couldn't load full-res COG (likely auth/CORS); showing preview.
              </span>
            )}
          </>
        )}
      </div>

      <div className="absolute top-[10px] right-[10px] z-[5] flex items-center gap-2 rounded-md border border-border bg-bg/85 px-2.5 py-1.5 text-xs">
        <label htmlFor="basemap">Base</label>
        <select id="basemap" value={baseMapKey} onChange={(e) => setBaseMapKey(e.target.value)}>
          {BASE_MAPS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      {timeline && <TimeSlider items={items} onWindowChange={setTimeWindowIds} />}

      <Map
        initialViewState={{ longitude: 12.5, latitude: 42, zoom: 4 }}
        mapStyle={baseStyle}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={drawing ? [] : ['footprints-fill']}
        cursor={drawing ? 'crosshair' : undefined}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onError={handleMapError}
      >
        {activeCogHref && (
          <Source id="cog-overlay" type="raster" url={`cog://${activeCogHref}`} tileSize={256}>
            <Layer id="cog-overlay-layer" type="raster" paint={{ 'raster-opacity': 1 }} />
          </Source>
        )}

        {overlays.map((ov) => (
          <Source key={ov.id} id={`quicklook-${ov.id}`} type="image" url={ov.url} coordinates={ov.coordinates}>
            <Layer id={`quicklook-layer-${ov.id}`} type="raster" paint={{ 'raster-opacity': 0.95 }} />
          </Source>
        ))}

        <Source id="footprints" type="geojson" data={footprints}>
          <Layer
            id="footprints-fill"
            type="fill"
            paint={{
              'fill-color': ['case', ['get', 'selected'], '#2f81f7', '#4a93ff'],
              // Keep the selected fill faint so the quicklook image shows through.
              'fill-opacity': ['case', ['get', 'selected'], 0.05, ['case', ['get', 'hovered'], 0.25, 0.08]],
            }}
          />
          <Layer
            id="footprints-line"
            type="line"
            paint={{
              'line-color': ['case', ['get', 'selected'], '#2f81f7', '#7fb1ff'],
              'line-width': ['case', ['get', 'selected'], 2.5, ['case', ['get', 'hovered'], 2, 1]],
            }}
          />
        </Source>

        <Source id="bbox" type="geojson" data={bboxPreview}>
          <Layer id="bbox-fill" type="fill" paint={{ 'fill-color': '#3fb950', 'fill-opacity': 0.1 }} />
          <Layer
            id="bbox-line"
            type="line"
            paint={{ 'line-color': '#3fb950', 'line-width': 2, 'line-dasharray': [2, 1] }}
          />
        </Source>
      </Map>
    </div>
  )
}
