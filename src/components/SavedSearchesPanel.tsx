import type { SavedSearch } from '../types/stac'

interface Props {
  searches: SavedSearch[]
  onLoad: (s: SavedSearch) => void
  onRemove: (id: string) => void
}

function summarize(s: SavedSearch): string {
  const p = s.params
  const parts: string[] = []
  if (p.collections.length) parts.push(`${p.collections.length} collection${p.collections.length > 1 ? 's' : ''}`)
  if (p.dateFrom || p.dateTo) parts.push(`${(p.dateFrom || '…').slice(0, 10)}→${(p.dateTo || '…').slice(0, 10)}`)
  if (p.bbox) parts.push('area')
  if (typeof p.maxCloudCover === 'number') parts.push(`☁️≤${p.maxCloudCover}%`)
  return parts.join(' · ') || 'no filters'
}

export default function SavedSearchesPanel({ searches, onLoad, onRemove }: Props) {
  if (searches.length === 0) {
    return <p className="hint">No saved searches. Use “Save” after setting the filters.</p>
  }
  return (
    <div className="mt-1.5">
      {searches.map((s) => (
        <div className="flex items-center gap-1.5 border-b border-border py-1.5" key={s.id}>
          <span
            className="flex-1 cursor-pointer overflow-hidden text-xs whitespace-nowrap text-ellipsis"
            title={summarize(s)}
            onClick={() => onLoad(s)}
          >
            {s.name}
            <br />
            <span className="hint">{summarize(s)}</span>
          </span>
          <button className="px-2 py-[3px] text-[11px]" title="Load" onClick={() => onLoad(s)}>
            ↻
          </button>
          <button className="px-2 py-[3px] text-[11px]" title="Delete" onClick={() => onRemove(s.id)}>
            🗑
          </button>
        </div>
      ))}
    </div>
  )
}
