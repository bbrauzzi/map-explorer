import { describe, it, expect } from 'vitest'
import {
  isValidBBox,
  bboxToPolygon,
  cornersToBBox,
  formatBBox,
  overlayCoordinates,
} from './bbox'
import type { BBox } from '../types/stac'

describe('isValidBBox', () => {
  it('accepts a well-formed bbox', () => {
    expect(isValidBBox([10, 40, 12, 42])).toBe(true)
  })

  it('rejects null / undefined', () => {
    expect(isValidBBox(null)).toBe(false)
    expect(isValidBBox(undefined)).toBe(false)
  })

  it('rejects the wrong number of elements', () => {
    expect(isValidBBox([10, 40, 12])).toBe(false)
    expect(isValidBBox([10, 40, 12, 42, 0])).toBe(false)
  })

  it('rejects NaN values', () => {
    expect(isValidBBox([10, NaN, 12, 42])).toBe(false)
  })

  it('rejects out-of-range coordinates', () => {
    expect(isValidBBox([-181, 40, 12, 42])).toBe(false) // west < -180
    expect(isValidBBox([10, 40, 181, 42])).toBe(false) // east > 180
    expect(isValidBBox([10, -91, 12, 42])).toBe(false) // south < -90
    expect(isValidBBox([10, 40, 12, 91])).toBe(false) // north > 90
  })

  it('rejects degenerate / inverted extents', () => {
    expect(isValidBBox([12, 40, 12, 42])).toBe(false) // west == east
    expect(isValidBBox([12, 40, 10, 42])).toBe(false) // west > east
    expect(isValidBBox([10, 42, 12, 42])).toBe(false) // south == north
    expect(isValidBBox([10, 42, 12, 40])).toBe(false) // south > north
  })
})

describe('cornersToBBox', () => {
  it('normalizes corners to [minLng, minLat, maxLng, maxLat]', () => {
    expect(cornersToBBox({ lng: 5, lat: 50 }, { lng: 10, lat: 55 })).toEqual([5, 50, 10, 55])
  })

  it('produces the same bbox regardless of click order', () => {
    const a = { lng: 5, lat: 50 }
    const b = { lng: 10, lat: 55 }
    expect(cornersToBBox(a, b)).toEqual(cornersToBBox(b, a))
  })

  it('handles a top-right -> bottom-left drag', () => {
    expect(cornersToBBox({ lng: 10, lat: 55 }, { lng: 5, lat: 50 })).toEqual([5, 50, 10, 55])
  })

  it('handles negative coordinates', () => {
    expect(cornersToBBox({ lng: -3, lat: -10 }, { lng: -8, lat: -2 })).toEqual([-8, -10, -3, -2])
  })
})

describe('bboxToPolygon', () => {
  it('produces a closed 5-point ring in [w,s] -> [e,s] -> [e,n] -> [w,n] -> [w,s] order', () => {
    const feature = bboxToPolygon([5, 50, 10, 55])
    expect(feature.type).toBe('Feature')
    expect(feature.geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [5, 50],
          [10, 50],
          [10, 55],
          [5, 55],
          [5, 50],
        ],
      ],
    })
  })

  it('closes the ring (first point equals last)', () => {
    const ring = (bboxToPolygon([5, 50, 10, 55]).geometry as GeoJSON.Polygon).coordinates[0]
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })
})

describe('formatBBox', () => {
  it('formats to 4 decimals, comma separated', () => {
    expect(formatBBox([5, 50.123456, 10, 55])).toBe('5.0000, 50.1235, 10.0000, 55.0000')
  })

  it('returns an empty string for undefined', () => {
    expect(formatBBox(undefined)).toBe('')
  })
})

describe('overlayCoordinates', () => {
  // A roughly north-up footprint: TL, TR, BR, BL ring (closed).
  const northUpPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [5, 55], // top-left
        [10, 55], // top-right
        [10, 50], // bottom-right
        [5, 50], // bottom-left
        [5, 55],
      ],
    ],
  }

  it('classifies a north-up polygon into [TL, TR, BR, BL]', () => {
    expect(overlayCoordinates(northUpPolygon)).toEqual([
      [5, 55],
      [10, 55],
      [10, 50],
      [5, 50],
    ])
  })

  it('rotates the ring by one vertex for SAR (ring [1,2,3,0])', () => {
    expect(overlayCoordinates(northUpPolygon, undefined, { sar: true })).toEqual([
      [10, 55], // ring[1]
      [10, 50], // ring[2]
      [5, 50], // ring[3]
      [5, 55], // ring[0]
    ])
  })

  it('falls back to the axis-aligned bbox when the footprint is unusable', () => {
    // A degenerate ring (all points share a quadrant) cannot be classified north-up,
    // so a valid bbox is used instead.
    const degenerate = {
      type: 'Polygon',
      coordinates: [
        [
          [5, 55],
          [6, 56],
          [7, 57],
          [8, 58],
          [5, 55],
        ],
      ],
    }
    const bbox: BBox = [5, 50, 10, 55]
    expect(overlayCoordinates(degenerate, bbox)).toEqual([
      [5, 55], // TL: [w, n]
      [10, 55], // TR: [e, n]
      [10, 50], // BR: [e, s]
      [5, 50], // BL: [w, s]
    ])
  })

  it('uses the bbox when there is no geometry', () => {
    expect(overlayCoordinates(null, [5, 50, 10, 55])).toEqual([
      [5, 55],
      [10, 55],
      [10, 50],
      [5, 50],
    ])
  })

  it('returns null when nothing is usable', () => {
    expect(overlayCoordinates(null, undefined)).toBeNull()
    expect(overlayCoordinates(null, [5, 50, 4, 55])).toBeNull() // invalid bbox
  })

  it('returns null for a non-Polygon geometry without a fallback bbox', () => {
    expect(overlayCoordinates({ type: 'Point', coordinates: [5, 50] })).toBeNull()
  })
})
