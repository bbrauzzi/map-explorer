import { describe, it, expect } from 'vitest'
import { cogAssets, itemTime } from './ItemDetail'
import type { StacItem } from '../types/stac'

function item(partial: Partial<StacItem>): StacItem {
  return {
    type: 'Feature',
    id: 'X',
    geometry: null,
    properties: {},
    assets: {},
    ...partial,
  }
}

describe('itemTime', () => {
  it('parses properties.datetime to epoch ms', () => {
    const t = itemTime(item({ properties: { datetime: '2024-01-01T00:00:00Z' } }))
    expect(t).toBe(Date.parse('2024-01-01T00:00:00Z'))
  })

  it('falls back to start_datetime', () => {
    const t = itemTime(item({ properties: { datetime: null, start_datetime: '2023-06-15T12:00:00Z' } }))
    expect(t).toBe(Date.parse('2023-06-15T12:00:00Z'))
  })

  it('returns null when there is no usable date', () => {
    expect(itemTime(item({ properties: {} }))).toBeNull()
    expect(itemTime(item({ properties: { datetime: 'not-a-date' } }))).toBeNull()
  })
})

describe('cogAssets', () => {
  it('includes http(s) GeoTIFF assets and excludes thumbnails / non-http', () => {
    const it = item({
      assets: {
        thumbnail: { href: 'https://example.com/preview.png', type: 'image/png' },
        visual: { href: 'https://example.com/visual.tif', type: 'image/tiff; application=geotiff', title: 'Visual' },
        s3data: { href: 's3://bucket/data.tif', type: 'image/tiff' },
        meta: { href: 'https://example.com/meta.json', type: 'application/json' },
      },
    })
    const cogs = cogAssets(it)
    expect(cogs.map((c) => c.key)).toEqual(['visual'])
    expect(cogs[0]).toMatchObject({ href: 'https://example.com/visual.tif', title: 'Visual' })
  })

  it('includes a renderable-role asset with a .tif href even without a type', () => {
    const it = item({
      assets: {
        data: { href: 'https://example.com/B04.tif', roles: ['data'] },
        other: { href: 'https://example.com/B04.bin', roles: ['data'] },
      },
    })
    expect(cogAssets(it).map((c) => c.key)).toEqual(['data'])
  })

  it('returns an empty list when there are no GeoTIFF assets', () => {
    expect(cogAssets(item({ assets: { thumbnail: { href: 'https://x/y.png' } } }))).toEqual([])
  })
})
