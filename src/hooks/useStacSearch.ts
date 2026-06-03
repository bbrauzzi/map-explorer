import { useCallback, useRef, useState } from 'react'
import { buildSearchBody, fetchNext, search, type SearchResult } from '../api/stac'
import type { SearchParams, StacItem, StacLink } from '../types/stac'

export interface UseStacSearch {
  items: StacItem[]
  matched?: number
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  lastParams: SearchParams | null
  runSearch: (params: SearchParams) => Promise<void>
  loadMore: () => Promise<void>
  reset: () => void
}

export function useStacSearch(): UseStacSearch {
  const [items, setItems] = useState<StacItem[]>([])
  const [matched, setMatched] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [next, setNext] = useState<StacLink | undefined>(undefined)
  const [lastParams, setLastParams] = useState<SearchParams | null>(null)

  // AbortController for the in-flight search, to cancel stale requests.
  const ctrlRef = useRef<AbortController | null>(null)
  // Current request body, needed for POST-based pagination.
  const bodyRef = useRef<Record<string, unknown>>({})

  const runSearch = useCallback(async (params: SearchParams) => {
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl

    setLoading(true)
    setError(null)
    setItems([])
    setMatched(undefined)
    setNext(undefined)
    setLastParams(params)
    bodyRef.current = buildSearchBody(params)

    try {
      const res: SearchResult = await search(params, ctrl.signal)
      if (ctrl.signal.aborted) return
      setItems(res.items)
      setMatched(res.matched)
      setNext(res.next)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message || 'Search failed')
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!next) return
    const ctrl = new AbortController()
    setLoadingMore(true)
    setError(null)
    try {
      const res = await fetchNext(next, bodyRef.current, ctrl.signal)
      setItems((prev) => [...prev, ...res.items])
      setNext(res.next)
      if (res.matched != null) setMatched(res.matched)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message || 'Failed to load page')
    } finally {
      setLoadingMore(false)
    }
  }, [next])

  const reset = useCallback(() => {
    ctrlRef.current?.abort()
    setItems([])
    setMatched(undefined)
    setError(null)
    setNext(undefined)
    setLastParams(null)
  }, [])

  return {
    items,
    matched,
    loading,
    loadingMore,
    error,
    hasMore: !!next,
    lastParams,
    runSearch,
    loadMore,
    reset,
  }
}
