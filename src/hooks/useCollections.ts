import { useEffect, useState } from 'react'
import { getCollections } from '../api/stac'
import { groupForCollectionId, MISSION_GROUPS, OTHER_GROUP, type MissionGroup } from '../config'
import type { StacCollection } from '../types/stac'

export interface CollectionOption {
  id: string
  label: string
}

export interface GroupedCollections {
  group: MissionGroup
  collections: CollectionOption[]
}

export interface UseCollectionsResult {
  loading: boolean
  error: string | null
  grouped: GroupedCollections[]
  byId: Record<string, StacCollection>
}

/** Loads all collections once and groups them by mission. */
export function useCollections(): UseCollectionsResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collections, setCollections] = useState<StacCollection[]>([])

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    getCollections(ctrl.signal)
      .then((cols) => {
        cols.sort((a, b) => a.id.localeCompare(b.id))
        setCollections(cols)
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        setError((e as Error).message || 'Unable to load collections')
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  const byId: Record<string, StacCollection> = {}
  for (const c of collections) byId[c.id] = c

  // Group while respecting the order defined in MISSION_GROUPS.
  const buckets = new Map<string, CollectionOption[]>()
  for (const c of collections) {
    const g = groupForCollectionId(c.id)
    const opt: CollectionOption = { id: c.id, label: c.title || c.id }
    const arr = buckets.get(g.key) ?? []
    arr.push(opt)
    buckets.set(g.key, arr)
  }

  const grouped: GroupedCollections[] = []
  for (const g of [...MISSION_GROUPS, OTHER_GROUP]) {
    const cols = buckets.get(g.key)
    if (cols && cols.length > 0) grouped.push({ group: g, collections: cols })
  }

  return { loading, error, grouped, byId }
}
