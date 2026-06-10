import { describe, it, expect } from 'vitest'
import { toPython, toCurl } from './codegen'
import type { SearchParams } from '../types/stac'

const full: SearchParams = {
  collections: ['sentinel-2-l2a'],
  bbox: [5, 50, 10, 55],
  dateFrom: '2024-01-01T00:00:00Z',
  dateTo: '2024-12-31T23:59:59Z',
  maxCloudCover: 20,
  limit: 50,
  sortby: { field: 'datetime', direction: 'desc' },
}

const minimal: SearchParams = {
  collections: ['sentinel-1-grd'],
  limit: 50,
}

describe('toPython', () => {
  it('emits a pystac-client snippet with every active filter', () => {
    const py = toPython(full)
    expect(py).toContain('from pystac_client import Client')
    expect(py).toContain('Client.open("https://stac.dataspace.copernicus.eu/v1")')
    expect(py).toContain('collections=[')
    expect(py).toContain('"sentinel-2-l2a"')
    expect(py).toContain('bbox=[')
    expect(py).toContain('datetime="2024-01-01T00:00:00Z/2024-12-31T23:59:59Z"')
    expect(py).toContain('filter_lang="cql2-json"')
    expect(py).toContain('"eo:cloud_cover"')
    expect(py).toContain('max_items=50')
  })

  it('uses the public endpoint, never the dev proxy path', () => {
    expect(toPython(full)).not.toContain('/stac/v1')
  })

  it('omits kwargs that are not set', () => {
    const py = toPython(minimal)
    expect(py).toContain('collections=[')
    expect(py).toContain('max_items=50')
    expect(py).not.toContain('bbox=')
    expect(py).not.toContain('datetime=')
    expect(py).not.toContain('filter_lang')
  })
})

describe('toCurl', () => {
  it('POSTs the exact search body to /search', () => {
    const curl = toCurl(full)
    expect(curl).toContain('curl -X POST "https://stac.dataspace.copernicus.eu/v1/search"')
    expect(curl).toContain('"Content-Type: application/json"')
    // The body is valid JSON and round-trips.
    const body = curl.slice(curl.indexOf("-d '") + 4, curl.lastIndexOf("'"))
    const parsed = JSON.parse(body)
    expect(parsed.collections).toEqual(['sentinel-2-l2a'])
    expect(parsed.bbox).toEqual([5, 50, 10, 55])
    expect(parsed.datetime).toBe('2024-01-01T00:00:00Z/2024-12-31T23:59:59Z')
    expect(parsed['filter-lang']).toBe('cql2-json')
  })
})
