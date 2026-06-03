import { useMemo, useState } from 'react'
import type { BBox, SavedSearch } from '../types/stac'
import { groupForCollectionId } from '../config'
import type { GroupedCollections } from '../hooks/useCollections'
import { formatBBox, isValidBBox } from '../utils/bbox'
import SavedSearchesPanel from './SavedSearchesPanel'

// Filter form state (controlled by App).
export interface FilterForm {
  collections: string[]
  dateFrom: string
  dateTo: string
  maxCloudCover?: number
  bbox?: BBox
}

export const EMPTY_FORM: FilterForm = {
  collections: [],
  dateFrom: '',
  dateTo: '',
  maxCloudCover: undefined,
  bbox: undefined,
}

interface Props {
  open: boolean
  grouped: GroupedCollections[]
  collectionsLoading: boolean
  collectionsError: string | null
  form: FilterForm
  setForm: (updater: (f: FilterForm) => FilterForm) => void
  searching: boolean
  onSearch: () => void
  onSave: (name: string) => void
  savedSearches: SavedSearch[]
  onLoadSaved: (s: SavedSearch) => void
  onRemoveSaved: (id: string) => void
  onStartDraw: () => void
  onClose: () => void
}

export default function FilterPanel({
  open,
  grouped,
  collectionsLoading,
  collectionsError,
  form,
  setForm,
  searching,
  onSearch,
  onSave,
  savedSearches,
  onLoadSaved,
  onRemoveSaved,
  onStartDraw,
  onClose,
}: Props) {
  // Which mission groups are expanded. Collapsed by default to avoid an
  // overwhelming list (the catalog has hundreds of collections).
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Show the cloud cover filter only if at least one selected collection is optical.
  const hasOptical = useMemo(
    () => form.collections.some((id) => groupForCollectionId(id).optical),
    [form.collections],
  )
  // The filter is "on" when maxCloudCover is set (derived from the form, so
  // loading a saved search reflects it automatically).
  const cloudEnabled = form.maxCloudCover != null

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleCollection = (id: string) => {
    setForm((f) => {
      const has = f.collections.includes(id)
      return { ...f, collections: has ? f.collections.filter((c) => c !== id) : [...f.collections, id] }
    })
  }

  const toggleGroup = (ids: string[], allSelected: boolean) => {
    setForm((f) => {
      const set = new Set(f.collections)
      if (allSelected) ids.forEach((id) => set.delete(id))
      else ids.forEach((id) => set.add(id))
      return { ...f, collections: [...set] }
    })
  }

  const setBBoxField = (idx: number, value: string) => {
    setForm((f) => {
      const current = (f.bbox ?? [NaN, NaN, NaN, NaN]).slice() as BBox
      current[idx] = value === '' ? NaN : Number(value)
      return { ...f, bbox: current }
    })
  }

  const handleSave = () => {
    const name = window.prompt('Name of the search to save:')
    if (name !== null) onSave(name)
  }

  return (
    <div
      className={`col-start-1 row-start-2 overflow-y-auto border-r border-border bg-panel px-4 pt-3 pb-6${
        open ? '' : ' hidden'
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <strong>Filters</strong>
        <button className="shrink-0 px-[9px] py-0.5 text-[15px] leading-none" title="Close panel" onClick={onClose}>
          «
        </button>
      </div>

      {/* ------- Collections / satellites ------- */}
      <div className="section-title">Satellite and data type</div>
      {collectionsLoading && <div className="spinner-line">Loading collections…</div>}
      {collectionsError && <div className="error-box">{collectionsError}</div>}
      {grouped.map(({ group, collections }) => {
        const ids = collections.map((c) => c.id)
        const allSelected = ids.every((id) => form.collections.includes(id))
        const selectedCount = ids.filter((id) => form.collections.includes(id)).length
        const isOpen = expanded.has(group.key)
        return (
          <div className="border-t border-border" key={group.key}>
            <div
              className="flex cursor-pointer items-center gap-2 px-0.5 py-[9px] select-none hover:text-accent"
              onClick={() => toggleExpanded(group.key)}
            >
              <span className="w-3 shrink-0 text-[11px] text-muted">{isOpen ? '▾' : '▸'}</span>
              <input
                type="checkbox"
                title="Select/deselect all"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = !allSelected && selectedCount > 0
                }}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleGroup(ids, allSelected)}
              />
              <span className="flex-1 text-[13px] font-semibold">{group.label}</span>
              <span className="shrink-0 rounded-[10px] border border-border bg-panel-2 px-[7px] text-[11px] text-muted">
                {selectedCount > 0 ? `${selectedCount}/${collections.length}` : collections.length}
              </span>
            </div>
            {isOpen && (
              <div className="pb-2 pl-7">
                {collections.map((c) => (
                  <label
                    key={c.id}
                    className="mt-0 mb-[5px] flex cursor-pointer items-center gap-1.5 text-xs text-text"
                  >
                    <input
                      type="checkbox"
                      checked={form.collections.includes(c.id)}
                      onChange={() => toggleCollection(c.id)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* ------- Dates ------- */}
      <div className="section-title">Date range</div>
      <div className="flex gap-2 [&>*]:flex-1">
        <div>
          <label>From</label>
          <input
            type="date"
            value={form.dateFrom ? form.dateFrom.slice(0, 10) : ''}
            onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value ? `${e.target.value}T00:00:00Z` : '' }))}
          />
        </div>
        <div>
          <label>To</label>
          <input
            type="date"
            value={form.dateTo ? form.dateTo.slice(0, 10) : ''}
            onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value ? `${e.target.value}T23:59:59Z` : '' }))}
          />
        </div>
      </div>

      {/* ------- Geographic area ------- */}
      <div className="section-title">Geographic area</div>
      <button className="w-full" onClick={onStartDraw}>
        ✏️ Draw area on the map
      </button>
      <div className="hint">Or enter the bounds (decimal degrees):</div>
      <div className="mt-1.5 flex gap-2 [&>*]:flex-1">
        <input placeholder="West" value={fmt(form.bbox?.[0])} onChange={(e) => setBBoxField(0, e.target.value)} />
        <input placeholder="South" value={fmt(form.bbox?.[1])} onChange={(e) => setBBoxField(1, e.target.value)} />
      </div>
      <div className="mt-1.5 flex gap-2 [&>*]:flex-1">
        <input placeholder="East" value={fmt(form.bbox?.[2])} onChange={(e) => setBBoxField(2, e.target.value)} />
        <input placeholder="North" value={fmt(form.bbox?.[3])} onChange={(e) => setBBoxField(3, e.target.value)} />
      </div>
      {form.bbox && (
        <div className="hint">
          {isValidBBox(form.bbox) ? `Area: ${formatBBox(form.bbox)}` : '⚠️ Invalid area'}{' '}
          <button className="px-2 py-px text-[11px]" onClick={() => setForm((f) => ({ ...f, bbox: undefined }))}>
            Remove
          </button>
        </div>
      )}

      {/* ------- Cloud cover ------- */}
      {hasOptical && (
        <>
          <div className="section-title">Cloud cover</div>
          <label className="mt-0 text-text">
            <input
              type="checkbox"
              className="mr-1.5"
              checked={cloudEnabled}
              onChange={(e) => {
                setForm((f) => ({ ...f, maxCloudCover: e.target.checked ? (f.maxCloudCover ?? 20) : undefined }))
              }}
            />
            Filter by maximum cloud cover
          </label>
          {cloudEnabled && (
            <div className="mt-2">
              <input
                type="range"
                min={0}
                max={100}
                value={form.maxCloudCover ?? 20}
                onChange={(e) => setForm((f) => ({ ...f, maxCloudCover: Number(e.target.value) }))}
              />
              <div className="hint">At most {form.maxCloudCover ?? 20}% clouds</div>
            </div>
          )}
        </>
      )}

      {/* ------- Actions ------- */}
      <div className="mt-[18px] flex gap-2 [&>button]:flex-1">
        <button
          className="btn-primary"
          disabled={searching || form.collections.length === 0}
          onClick={() => onSearch()}
          title={form.collections.length === 0 ? 'Select at least one collection' : 'Run the search'}
        >
          {searching ? 'Searching…' : '🔍 Search'}
        </button>
        <button onClick={handleSave} title="Save the current filters">
          💾 Save
        </button>
      </div>
      {form.collections.length === 0 && <div className="hint">Select at least one collection to search.</div>}

      {/* ------- Saved searches ------- */}
      <div className="section-title">Saved searches</div>
      <SavedSearchesPanel searches={savedSearches} onLoad={onLoadSaved} onRemove={onRemoveSaved} />
    </div>
  )
}

function fmt(v?: number): string {
  return v == null || Number.isNaN(v) ? '' : String(v)
}
