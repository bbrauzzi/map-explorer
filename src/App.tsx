import { useCallback, useState } from 'react'
import FilterPanel, { EMPTY_FORM, type FilterForm } from './components/FilterPanel'
import MapView from './components/MapView'
import ResultList from './components/ResultList'
import ItemDetail from './components/ItemDetail'
import CodeModal from './components/CodeModal'
import { useCollections } from './hooks/useCollections'
import { useStacSearch } from './hooks/useStacSearch'
import { useSavedSearches } from './hooks/useSavedSearches'
import { groupForCollectionId, PAGE_LIMIT } from './config'
import type { BBox, SavedSearch, SearchParams, StacItem } from './types/stac'
import { isValidBBox } from './utils/bbox'

// Converts the form state into STAC search parameters.
function formToParams(form: FilterForm): SearchParams {
  const hasOptical = form.collections.some((id) => groupForCollectionId(id).optical)
  return {
    collections: form.collections,
    bbox: isValidBBox(form.bbox) ? form.bbox : undefined,
    dateFrom: form.dateFrom || undefined,
    dateTo: form.dateTo || undefined,
    // only apply the cloud cover filter when it makes sense (optical collections)
    maxCloudCover: hasOptical ? form.maxCloudCover : undefined,
    limit: PAGE_LIMIT,
    sortby: { field: 'datetime', direction: 'desc' },
  }
}

function paramsToForm(p: SearchParams): FilterForm {
  return {
    collections: p.collections,
    dateFrom: p.dateFrom || '',
    dateTo: p.dateTo || '',
    maxCloudCover: p.maxCloudCover,
    bbox: p.bbox,
  }
}

export default function App() {
  const collections = useCollections()
  const stac = useStacSearch()
  const saved = useSavedSearches()

  const [form, setFormState] = useState<FilterForm>(EMPTY_FORM)
  const setForm = useCallback((updater: (f: FilterForm) => FilterForm) => setFormState(updater), [])

  // Multi-selection: clicking a result (in the list or its footprint) toggles it.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<StacItem | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)
  const [drawing, setDrawing] = useState(false)

  // Collapsible side panels.
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [resultsOpen, setResultsOpen] = useState(true)

  const runSearch = useCallback(() => {
    setSelectedIds(new Set())
    if (!resultsOpen) setResultsOpen(true)
    stac.runSearch(formToParams(form))
  }, [form, stac, resultsOpen])

  const handleBBoxDrawn = useCallback((bbox: BBox) => {
    setForm((f) => ({ ...f, bbox }))
  }, [setForm])

  const toggleSelect = useCallback((item: StacItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleSave = useCallback(
    (name: string) => {
      saved.save(name, formToParams(form))
    },
    [form, saved],
  )

  const handleLoadSaved = useCallback(
    (s: SavedSearch) => {
      const f = paramsToForm(s.params)
      setFormState(f)
      setSelectedIds(new Set())
      if (!resultsOpen) setResultsOpen(true)
      // run the loaded search right away
      stac.runSearch(s.params)
    },
    [stac, resultsOpen],
  )

  const gridTemplateColumns = `${filtersOpen ? '320px' : '0'} 1fr ${resultsOpen ? '380px' : '0'}`

  return (
    <div className="grid h-screen grid-rows-[3rem_1fr] overflow-hidden" style={{ gridTemplateColumns }}>
      <header className="col-span-3 flex items-center gap-3 border-b border-border bg-panel px-4">
        <button
          className={`shrink-0 px-2.5 py-[5px] text-xs${filtersOpen ? ' border-accent text-accent' : ''}`}
          title="Toggle filters panel"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          ☰ Filters
        </button>
        <h1 className="m-0 text-base font-semibold whitespace-nowrap">🛰️ MapExplorer</h1>
        <span className="overflow-hidden text-xs whitespace-nowrap text-ellipsis text-muted">
          ESA data search via STAC — Copernicus Data Space
        </span>
        <span className="flex-1" />
        <button
          className={`shrink-0 px-2.5 py-[5px] text-xs${resultsOpen ? ' border-accent text-accent' : ''}`}
          title="Toggle results panel"
          onClick={() => setResultsOpen((o) => !o)}
        >
          Results{stac.items.length ? ` (${stac.items.length})` : ''} ☰
        </button>
      </header>

      <FilterPanel
        open={filtersOpen}
        grouped={collections.grouped}
        collectionsLoading={collections.loading}
        collectionsError={collections.error}
        form={form}
        setForm={setForm}
        searching={stac.loading}
        onSearch={runSearch}
        onSave={handleSave}
        savedSearches={saved.searches}
        onLoadSaved={handleLoadSaved}
        onRemoveSaved={saved.remove}
        onStartDraw={() => setDrawing(true)}
        onClose={() => setFiltersOpen(false)}
      />

      <MapView
        items={stac.items}
        bbox={form.bbox}
        selectedIds={selectedIds}
        hoveredId={hoveredId}
        drawing={drawing}
        onSelect={toggleSelect}
        onHover={setHoveredId}
        onBBoxDrawn={handleBBoxDrawn}
        onDrawingChange={setDrawing}
      />

      <div
        className={`col-start-3 row-start-2 flex flex-col overflow-y-auto border-l border-border bg-panel${
          resultsOpen ? '' : ' hidden'
        }`}
      >
        {stac.error && <div className="error-box m-3">{stac.error}</div>}
        <ResultList
          items={stac.items}
          matched={stac.matched}
          loading={stac.loading}
          loadingMore={stac.loadingMore}
          hasMore={stac.hasMore}
          selectedIds={selectedIds}
          hoveredId={hoveredId}
          onSelect={toggleSelect}
          onHover={setHoveredId}
          onOpenDetail={setDetailItem}
          onLoadMore={stac.loadMore}
          onClose={() => setResultsOpen(false)}
          onClearSelection={clearSelection}
          onShowCode={() => setCodeOpen(true)}
          canShowCode={stac.lastParams != null}
        />
      </div>

      {detailItem && <ItemDetail item={detailItem} onClose={() => setDetailItem(null)} />}
      {codeOpen && <CodeModal params={stac.lastParams} onClose={() => setCodeOpen(false)} />}
    </div>
  )
}
