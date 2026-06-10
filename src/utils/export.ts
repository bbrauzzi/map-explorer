import type { StacItem } from '../types/stac'

export function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function stamp(): string {
  // YYYYMMDD-HHMMSS
  return new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '')
}

/** Exports the raw STAC items as a GeoJSON/JSON FeatureCollection. */
export function exportJSON(items: StacItem[]) {
  const fc = { type: 'FeatureCollection', features: items }
  triggerDownload(JSON.stringify(fc, null, 2), `stac-export-${stamp()}.json`, 'application/json')
}

// Flattened metadata columns for the CSV.
const CSV_COLUMNS: { header: string; get: (it: StacItem) => unknown }[] = [
  { header: 'id', get: (it) => it.id },
  { header: 'collection', get: (it) => it.collection ?? '' },
  { header: 'datetime', get: (it) => it.properties.datetime ?? it.properties['start_datetime'] ?? '' },
  { header: 'end_datetime', get: (it) => it.properties['end_datetime'] ?? '' },
  { header: 'platform', get: (it) => it.properties.platform ?? '' },
  { header: 'cloud_cover', get: (it) => it.properties['eo:cloud_cover'] ?? '' },
  { header: 'bbox', get: (it) => (it.bbox ? it.bbox.join(' ') : '') },
  {
    header: 'thumbnail',
    get: (it) => it.assets?.thumbnail?.href ?? it.assets?.QUICKLOOK?.href ?? '',
  },
]

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Exports the main item metadata as CSV. */
export function exportCSV(items: StacItem[]) {
  const lines: string[] = []
  lines.push(CSV_COLUMNS.map((c) => c.header).join(','))
  for (const it of items) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(c.get(it))).join(','))
  }
  // BOM for Excel compatibility.
  triggerDownload('﻿' + lines.join('\n'), `stac-export-${stamp()}.csv`, 'text/csv;charset=utf-8')
}
