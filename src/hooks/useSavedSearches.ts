import { useCallback, useEffect, useState } from 'react'
import { LS_KEY_SAVED_SEARCHES } from '../config'
import type { SavedSearch, SearchParams } from '../types/stac'

function load(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(LS_KEY_SAVED_SEARCHES)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedSearch[]) : []
  } catch {
    return []
  }
}

function persist(list: SavedSearch[]) {
  try {
    localStorage.setItem(LS_KEY_SAVED_SEARCHES, JSON.stringify(list))
  } catch {
    /* quota full or storage unavailable: silently ignore */
  }
}

// Simple dependency-free id (Date.now is fine here, it runs in the browser).
function genId(): string {
  return `s_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

export interface UseSavedSearches {
  searches: SavedSearch[]
  save: (name: string, params: SearchParams) => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
}

export function useSavedSearches(): UseSavedSearches {
  const [searches, setSearches] = useState<SavedSearch[]>(() => load())

  // Sync across tabs/windows of the same browser.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_SAVED_SEARCHES) setSearches(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const save = useCallback((name: string, params: SearchParams) => {
    setSearches((prev) => {
      const entry: SavedSearch = {
        id: genId(),
        name: name.trim() || 'Untitled search',
        createdAt: new Date().toISOString(),
        params,
      }
      const next = [entry, ...prev]
      persist(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setSearches((prev) => {
      const next = prev.filter((s) => s.id !== id)
      persist(next)
      return next
    })
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setSearches((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, name } : s))
      persist(next)
      return next
    })
  }, [])

  return { searches, save, remove, rename }
}
