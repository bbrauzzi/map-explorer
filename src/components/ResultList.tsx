import type { StacItem } from '../types/stac'
import { itemDatetime, thumbnailHref } from './ItemDetail'
import { exportCSV, exportJSON } from '../utils/export'

interface Props {
  items: StacItem[]
  matched?: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  selectedIds: Set<string>
  hoveredId: string | null
  onSelect: (item: StacItem) => void
  onHover: (id: string | null) => void
  onOpenDetail: (item: StacItem) => void
  onLoadMore: () => void
  onClose: () => void
  onClearSelection: () => void
}

function ResultRow({
  item,
  selected,
  hovered,
  onSelect,
  onHover,
  onOpenDetail,
}: {
  item: StacItem
  selected: boolean
  hovered: boolean
  onSelect: (i: StacItem) => void
  onHover: (id: string | null) => void
  onOpenDetail: (i: StacItem) => void
}) {
  const thumb = thumbnailHref(item)
  const thumbBase = 'h-[72px] w-[72px] shrink-0 rounded border border-border bg-panel-2 object-cover'
  const bg = selected ? 'bg-accent/[0.18]' : hovered ? 'bg-panel-2' : ''
  return (
    <div
      className={`flex cursor-pointer gap-2.5 border-b border-border px-[14px] py-2.5 hover:bg-panel-2 ${bg}`}
      onClick={() => onSelect(item)}
      onDoubleClick={() => onOpenDetail(item)}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
    >
      {thumb ? (
        <img
          className={thumbBase}
          src={thumb}
          alt=""
          loading="lazy"
          onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
        />
      ) : (
        <div className={`${thumbBase} flex items-center justify-center text-center text-[10px] text-muted`}>
          no
          <br />
          preview
        </div>
      )}
      <div className="overflow-hidden">
        <div className="text-xs font-semibold break-all">{item.id}</div>
        <div className="mt-[3px] text-[11px] text-muted">
          <span className="badge">{item.collection}</span>
        </div>
        <div className="mt-[3px] text-[11px] text-muted">📅 {itemDatetime(item)}</div>
        {item.properties['eo:cloud_cover'] != null && (
          <div className="mt-[3px] text-[11px] text-muted">☁️ {item.properties['eo:cloud_cover']}%</div>
        )}
        <div className="mt-[3px] text-[11px] text-muted">
          <button
            className="px-2 py-0.5 text-[11px]"
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetail(item)
            }}
          >
            Details
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ResultList({
  items,
  matched,
  loading,
  loadingMore,
  hasMore,
  selectedIds,
  hoveredId,
  onSelect,
  onHover,
  onOpenDetail,
  onLoadMore,
  onClose,
  onClearSelection,
}: Props) {
  return (
    <>
      <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-border bg-panel px-[14px] py-3">
        <div>
          <strong>Results</strong>{' '}
          <span className="hint">
            {items.length}
            {matched != null ? ` / ${matched}` : ''}
            {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
          </span>
        </div>
        <div className="flex gap-1.5">
          {selectedIds.size > 0 && (
            <button title="Clear selection" onClick={onClearSelection}>
              Clear
            </button>
          )}
          <button
            disabled={items.length === 0}
            title="Export current results as JSON (GeoJSON)"
            onClick={() => exportJSON(items)}
          >
            JSON
          </button>
          <button
            disabled={items.length === 0}
            title="Export metadata as CSV"
            onClick={() => exportCSV(items)}
          >
            CSV
          </button>
          <button title="Close panel" onClick={onClose}>
            »
          </button>
        </div>
      </div>

      <div className="flex-1">
        {loading && <div className="spinner-line">Searching…</div>}

        {!loading && items.length === 0 && (
          <div className="px-4 py-7 text-center text-[13px] text-muted">
            No results. Set the filters and press <strong>Search</strong>.
          </div>
        )}

        {items.map((item) => (
          <ResultRow
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            hovered={item.id === hoveredId}
            onSelect={onSelect}
            onHover={onHover}
            onOpenDetail={onOpenDetail}
          />
        ))}

        {hasMore && !loading && (
          <div className="p-[14px]">
            <button className="w-full" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
