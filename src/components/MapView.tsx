import { useCallback, useMemo, useState } from 'react'
import Map, { Layer, Source, type MapLayerMouseEvent } from 'react-map-gl/maplibre'
import type { StyleSpecification } from 'maplibre-gl'
import type { BBox, StacItem } from '../types/stac'
import { bboxToPolygon, cornersToBBox, overlayCoordinates, type ImageCorners } from '../utils/bbox'
import { thumbnailHref } from './ItemDetail'

// Base raster map style (OSM), no token or paid services required.
const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

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

// In dev, route creodias quicklook URLs through the Vite /thumb proxy so the
// WebGL texture loads same-origin (no CORS / redirect quirks). In prod the
// final image response is CORS `*`, so we load it directly.
function thumbForMap(href: string): string {
  if (!import.meta.env.DEV) return href
  try {
    const u = new URL(href, window.location.origin)
    if (u.hostname.endsWith('creodias.eu')) return `/thumb${u.pathname}${u.search}`
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

  // Georeferenced quicklook overlays, one per selected item (with a thumbnail
  // and a usable footprint/bbox).
  const overlays = useMemo(() => {
    if (!showImagery || selectedIds.size === 0) return []
    return items
      .filter((it) => selectedIds.has(it.id))
      .map((it) => {
        const href = thumbnailHref(it)
        const coords = overlayCoordinates(it.geometry, it.bbox, { sar: isSarItem(it) })
        if (!href || !coords) return null
        return { id: it.id, url: thumbForMap(href), coordinates: coords }
      })
      .filter(Boolean) as { id: string; url: string; coordinates: ImageCorners }[]
  }, [showImagery, selectedIds, items])

  // FeatureCollection of the result footprints.
  const footprints = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: items
        .filter((it) => it.geometry)
        .map((it) => ({
          type: 'Feature' as const,
          id: it.id,
          properties: { id: it.id, selected: selectedIds.has(it.id), hovered: it.id === hoveredId },
          geometry: it.geometry as GeoJSON.Geometry,
        })),
    }),
    [items, selectedIds, hoveredId],
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
          </>
        )}
      </div>

      <Map
        initialViewState={{ longitude: 12.5, latitude: 42, zoom: 4 }}
        mapStyle={BASE_STYLE}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={drawing ? [] : ['footprints-fill']}
        cursor={drawing ? 'crosshair' : undefined}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
      >
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
