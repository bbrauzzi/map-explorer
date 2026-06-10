import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import type { ComponentProps } from 'react'

// ---------------------------------------------------------------------------
// Mock react-map-gl/maplibre. The real module needs WebGL, which jsdom can't
// provide. The mock renders inspectable <div>s instead and captures the Map's
// onClick / onMouseMove so tests can fire synthetic MapLayerMouseEvents.
// ---------------------------------------------------------------------------
const mapCapture = vi.hoisted(() => ({
  onClick: undefined as ((e: unknown) => void) | undefined,
  onMouseMove: undefined as ((e: unknown) => void) | undefined,
}))

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')
  function Map(props: Record<string, unknown>) {
    mapCapture.onClick = props.onClick as typeof mapCapture.onClick
    mapCapture.onMouseMove = props.onMouseMove as typeof mapCapture.onMouseMove
    return React.createElement(
      'div',
      {
        'data-testid': 'map',
        'data-interactive-layers': JSON.stringify(props.interactiveLayerIds),
        'data-cursor': (props.cursor as string) ?? '',
      },
      props.children as React.ReactNode,
    )
  }
  function Source(props: Record<string, unknown>) {
    const attrs: Record<string, string> = {
      'data-testid': `source-${props.id}`,
      'data-source-type': String(props.type),
    }
    if (props.data !== undefined) attrs['data-geojson'] = JSON.stringify(props.data)
    if (props.url !== undefined) attrs['data-url'] = String(props.url)
    if (props.coordinates !== undefined) attrs['data-coordinates'] = JSON.stringify(props.coordinates)
    return React.createElement('div', attrs, props.children as React.ReactNode)
  }
  function Layer(props: Record<string, unknown>) {
    return React.createElement('div', { 'data-testid': `layer-${props.id}` })
  }
  return { default: Map, Source, Layer }
})

// The real maplibre-gl touches WebGL / web workers at import time (and
// URL.createObjectURL, which jsdom lacks). MapView only needs addProtocol.
vi.mock('maplibre-gl', () => ({ default: { addProtocol: vi.fn() } }))
vi.mock('@geomatico/maplibre-cog-protocol', () => ({ cogProtocol: vi.fn() }))

// Imported after the mock is registered (vi.mock is hoisted regardless).
import MapView from './MapView'
import type { StacItem, BBox } from '../types/stac'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const RING = [
  [5, 55], // top-left
  [10, 55], // top-right
  [10, 50], // bottom-right
  [5, 50], // bottom-left
  [5, 55],
]

const opticalItem: StacItem = {
  type: 'Feature',
  id: 'S2_A',
  collection: 'sentinel-2-l2a',
  geometry: { type: 'Polygon', coordinates: [RING] },
  bbox: [5, 50, 10, 55],
  properties: { datetime: '2024-01-01T00:00:00Z', platform: 'sentinel-2a' },
  assets: { thumbnail: { href: 'https://datahub.creodias.eu/odata/v1/preview.png' } },
}

const sarItem: StacItem = {
  type: 'Feature',
  id: 'S1_B',
  collection: 'sentinel-1-grd',
  geometry: { type: 'Polygon', coordinates: [RING] },
  bbox: [5, 50, 10, 55],
  properties: { datetime: '2024-01-02T00:00:00Z', platform: 'sentinel-1a' },
  assets: { thumbnail: { href: 'https://datahub.creodias.eu/odata/v1/sar.png' } },
}

const noGeomItem: StacItem = {
  type: 'Feature',
  id: 'NG_C',
  collection: 'sentinel-2-l2a',
  geometry: null,
  properties: { datetime: '2024-01-03T00:00:00Z' },
  assets: {},
}

type Props = ComponentProps<typeof MapView>

function renderMapView(overrides: Partial<Props> = {}) {
  const props: Props = {
    items: [opticalItem, sarItem],
    bbox: undefined,
    selectedIds: new Set<string>(),
    hoveredId: null,
    drawing: false,
    onSelect: vi.fn(),
    onHover: vi.fn(),
    onBBoxDrawn: vi.fn(),
    onDrawingChange: vi.fn(),
    ...overrides,
  }
  const result = render(<MapView {...props} />)
  return { props, ...result }
}

// Build a MapLayerMouseEvent-shaped object.
function mapEvent(lng: number, lat: number, featureId?: string) {
  const features = featureId
    ? [{ layer: { id: 'footprints-fill' }, properties: { id: featureId } }]
    : []
  return { lngLat: { lng, lat }, features }
}

function fireMapClick(lng: number, lat: number, featureId?: string) {
  act(() => mapCapture.onClick!(mapEvent(lng, lat, featureId)))
}

function fireMapMouseMove(lng: number, lat: number, featureId?: string) {
  act(() => mapCapture.onMouseMove!(mapEvent(lng, lat, featureId)))
}

function geojson(testid: string) {
  const attr = screen.getByTestId(testid).getAttribute('data-geojson')
  return JSON.parse(attr!) as GeoJSON.FeatureCollection
}

beforeEach(() => {
  mapCapture.onClick = undefined
  mapCapture.onMouseMove = undefined
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// Toolbar / draw mode
// ---------------------------------------------------------------------------
describe('MapView toolbar', () => {
  it('renders the draw + imagery controls when not drawing', () => {
    renderMapView()
    expect(screen.getByRole('button', { name: /Draw area/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Imagery on/i })).toBeInTheDocument()
  })

  it('starts drawing when "Draw area" is clicked', () => {
    const { props } = renderMapView()
    fireEvent.click(screen.getByRole('button', { name: /Draw area/i }))
    expect(props.onDrawingChange).toHaveBeenCalledWith(true)
  })

  it('shows the first-corner prompt and a Cancel button while drawing', () => {
    const { props } = renderMapView({ drawing: true })
    expect(screen.getByText(/Click the first corner/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(props.onDrawingChange).toHaveBeenCalledWith(false)
  })

  it('toggles the imagery overlay on and off', () => {
    renderMapView({ selectedIds: new Set(['S2_A']) })
    expect(screen.getByTestId('source-quicklook-S2_A')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Imagery on/i }))
    expect(screen.getByRole('button', { name: /Imagery off/i })).toBeInTheDocument()
    expect(screen.queryByTestId('source-quicklook-S2_A')).not.toBeInTheDocument()
  })

  it('disables footprint interactivity while drawing', () => {
    const { rerender } = renderMapView()
    expect(screen.getByTestId('map').getAttribute('data-interactive-layers')).toBe(
      JSON.stringify(['footprints-fill']),
    )
    rerender(
      <MapView
        items={[opticalItem, sarItem]}
        selectedIds={new Set()}
        hoveredId={null}
        drawing
        onSelect={vi.fn()}
        onHover={vi.fn()}
        onBBoxDrawn={vi.fn()}
        onDrawingChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('map').getAttribute('data-interactive-layers')).toBe(
      JSON.stringify([]),
    )
  })
})

// ---------------------------------------------------------------------------
// Select / hover handlers
// ---------------------------------------------------------------------------
describe('MapView selection and hover', () => {
  it('selects the clicked footprint', () => {
    const { props } = renderMapView()
    fireMapClick(7, 52, 'S2_A')
    expect(props.onSelect).toHaveBeenCalledTimes(1)
    expect(props.onSelect).toHaveBeenCalledWith(opticalItem)
  })

  it('does not select when the click hits no footprint', () => {
    const { props } = renderMapView()
    fireMapClick(7, 52)
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('hovers the feature under the cursor, and clears hover over empty map', () => {
    const { props } = renderMapView()
    fireMapMouseMove(7, 52, 'S1_B')
    expect(props.onHover).toHaveBeenLastCalledWith('S1_B')
    fireMapMouseMove(0, 0)
    expect(props.onHover).toHaveBeenLastCalledWith(null)
  })
})

// ---------------------------------------------------------------------------
// Two-click bbox draw flow
// ---------------------------------------------------------------------------
describe('MapView bbox drawing', () => {
  it('takes two clicks to draw an area and normalizes the corners', () => {
    const { props } = renderMapView({ drawing: true })

    // First click: records the corner, no bbox emitted yet, prompt advances.
    fireMapClick(10, 50, undefined)
    expect(props.onBBoxDrawn).not.toHaveBeenCalled()
    expect(screen.getByText(/Click the second corner/i)).toBeInTheDocument()

    // Second click (dragged up-left): bbox is normalized regardless of order.
    fireMapClick(5, 55, undefined)
    expect(props.onBBoxDrawn).toHaveBeenCalledTimes(1)
    expect(props.onBBoxDrawn).toHaveBeenCalledWith([5, 50, 10, 55])
    expect(props.onDrawingChange).toHaveBeenCalledWith(false)
  })

  it('previews a live rubber-band while drawing without calling onHover', () => {
    const { props } = renderMapView({ drawing: true })
    fireMapClick(5, 55, undefined) // first corner
    fireMapMouseMove(10, 50, 'S2_A') // move; would normally hover S2_A

    expect(props.onHover).not.toHaveBeenCalled()
    const preview = geojson('source-bbox')
    expect(preview.features).toHaveLength(1)
    const ring = (preview.features[0].geometry as GeoJSON.Polygon).coordinates[0]
    // cornersToBBox({5,55},{10,50}) -> [5,50,10,55] -> closed ring
    expect(ring).toEqual([
      [5, 50],
      [10, 50],
      [10, 55],
      [5, 55],
      [5, 50],
    ])
  })
})

// ---------------------------------------------------------------------------
// Derived GeoJSON sources (footprints / bboxPreview / overlays)
// ---------------------------------------------------------------------------
describe('MapView footprints source', () => {
  it('emits one feature per item with geometry and reflects selected/hovered', () => {
    renderMapView({
      items: [opticalItem, sarItem, noGeomItem],
      selectedIds: new Set(['S2_A']),
      hoveredId: 'S1_B',
    })
    const fc = geojson('source-footprints')
    expect(fc.features).toHaveLength(2) // noGeomItem filtered out

    const byId = Object.fromEntries(fc.features.map((f) => [f.properties!.id, f.properties]))
    expect(byId['S2_A']).toMatchObject({ selected: true, hovered: false })
    expect(byId['S1_B']).toMatchObject({ selected: false, hovered: true })
  })
})

describe('MapView bbox preview source', () => {
  it('renders the confirmed bbox as a polygon when not drawing', () => {
    const bbox: BBox = [5, 50, 10, 55]
    renderMapView({ bbox })
    const fc = geojson('source-bbox')
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry.type).toBe('Polygon')
  })

  it('renders no preview when there is no bbox and not drawing', () => {
    renderMapView()
    expect(geojson('source-bbox').features).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Base-map switcher + timeline
// ---------------------------------------------------------------------------
describe('MapView base map + timeline', () => {
  it('renders the base-map switcher with the available styles', () => {
    renderMapView()
    expect(screen.getByLabelText('Base')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Streets' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Satellite' })).toBeInTheDocument()
  })

  it('toggles the timeline control and filters footprints by acquisition date', () => {
    // opticalItem @ 2024-01-01, sarItem @ 2024-01-02 -> two distinct stops.
    renderMapView()
    fireEvent.click(screen.getByRole('button', { name: /Timeline off/i }))

    // The slider appears and starts with all items visible.
    expect(screen.getByRole('slider')).toBeInTheDocument()
    expect(geojson('source-footprints').features).toHaveLength(2)

    // Stepping back to the earliest stop leaves only the earliest item.
    fireEvent.click(screen.getByRole('button', { name: '◀' }))
    expect(geojson('source-footprints').features).toHaveLength(1)
  })
})

describe('MapView quicklook overlays', () => {
  it('renders no overlay when nothing is selected', () => {
    renderMapView()
    expect(screen.queryByTestId('source-quicklook-S2_A')).not.toBeInTheDocument()
  })

  it('georeferences optical (north-up) and SAR footprints differently', () => {
    renderMapView({ selectedIds: new Set(['S2_A', 'S1_B']) })

    const optical = screen
      .getByTestId('source-quicklook-S2_A')
      .getAttribute('data-coordinates')
    const sar = screen.getByTestId('source-quicklook-S1_B').getAttribute('data-coordinates')

    // Optical: classified to [TL, TR, BR, BL].
    expect(JSON.parse(optical!)).toEqual([
      [5, 55],
      [10, 55],
      [10, 50],
      [5, 50],
    ])
    // SAR: ring rotated by one vertex [1, 2, 3, 0].
    expect(JSON.parse(sar!)).toEqual([
      [10, 55],
      [10, 50],
      [5, 50],
      [5, 55],
    ])
    expect(optical).not.toEqual(sar)
  })

  it('proxies creodias quicklook URLs through /thumb in dev', () => {
    vi.stubEnv('DEV', true)
    renderMapView({ selectedIds: new Set(['S2_A']) })
    expect(screen.getByTestId('source-quicklook-S2_A').getAttribute('data-url')).toBe(
      '/thumb/odata/v1/preview.png',
    )
  })

  it('rewrites datahub quicklook URLs to zipper in prod (skips the CORS-less redirect)', () => {
    vi.stubEnv('DEV', false)
    renderMapView({ selectedIds: new Set(['S2_A']) })
    expect(screen.getByTestId('source-quicklook-S2_A').getAttribute('data-url')).toBe(
      'https://zipper.creodias.eu/odata/v1/preview.png',
    )
  })
})
