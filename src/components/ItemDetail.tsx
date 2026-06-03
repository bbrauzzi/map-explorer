import { useState } from 'react'
import type { StacItem } from '../types/stac'

export function thumbnailHref(item: StacItem): string | undefined {
  const a = item.assets || {}
  return (
    a.thumbnail?.href ||
    a.QUICKLOOK?.href ||
    a.quicklook?.href ||
    a.preview?.href ||
    // first asset with a "thumbnail" or "overview" role
    Object.values(a).find((x) => x.roles?.some((r) => ['thumbnail', 'overview'].includes(r)))?.href
  )
}

export function itemDatetime(item: StacItem): string {
  return (
    (item.properties.datetime as string) ||
    (item.properties['start_datetime'] as string) ||
    '—'
  )
}

interface Props {
  item: StacItem
  onClose: () => void
}

export default function ItemDetail({ item, onClose }: Props) {
  const [imgError, setImgError] = useState(false)
  const thumb = thumbnailHref(item)
  const p = item.properties

  const metaRows: [string, unknown][] = [
    ['ID', item.id],
    ['Collection', item.collection],
    ['Acquisition date', itemDatetime(item)],
    ['Acquisition end', p['end_datetime']],
    ['Platform', p.platform],
    ['Cloud cover', p['eo:cloud_cover'] != null ? `${p['eo:cloud_cover']}%` : undefined],
    ['Bounding box', item.bbox?.map((v) => v.toFixed(3)).join(', ')],
  ]

  const previewBox = 'my-3 max-h-[320px] w-full rounded-md border border-border bg-panel-2'
  const td = 'border-b border-border px-2 py-[5px] align-top'
  const tdKey = `${td} w-[38%] text-muted`

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-[760px] overflow-y-auto rounded-[10px] border border-border bg-panel px-5 py-[18px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="float-right" onClick={onClose}>
          ✕ Close
        </button>
        <h2 className="m-0 mb-1 text-base break-all">{item.id}</h2>
        <span className="badge">{item.collection}</span>

        {thumb && !imgError ? (
          <img
            className={`${previewBox} object-contain`}
            src={thumb}
            alt={`Preview of ${item.id}`}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`${previewBox} flex min-h-[120px] items-center justify-center`}>
            <span className="hint">Preview not available (may require authentication)</span>
          </div>
        )}

        <table className="w-full border-collapse text-xs">
          <tbody>
            {metaRows
              .filter(([, v]) => v != null && v !== '')
              .map(([k, v]) => (
                <tr key={k}>
                  <td className={tdKey}>{k}</td>
                  <td className={td}>{String(v)}</td>
                </tr>
              ))}
          </tbody>
        </table>

        <details className="mt-[14px]">
          <summary>Available assets ({Object.keys(item.assets || {}).length})</summary>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {Object.entries(item.assets || {}).map(([key, asset]) => (
                <tr key={key}>
                  <td className={tdKey}>{asset.title || key}</td>
                  <td className={td}>
                    <a href={asset.href} target="_blank" rel="noreferrer" className="text-accent">
                      {asset.type || 'open'}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        <details className="mt-[14px]">
          <summary>Raw STAC metadata (JSON)</summary>
          <pre className="mt-2 max-h-[280px] overflow-auto rounded-md border border-border bg-bg p-2.5 text-[11px]">
            {JSON.stringify(item, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  )
}
