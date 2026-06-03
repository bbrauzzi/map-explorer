import { STAC_BASE_URL } from '../config'
import type {
  SearchParams,
  StacCollection,
  StacItem,
  StacItemCollection,
  StacLink,
} from '../types/stac'
import { buildCql2Filter } from '../utils/cql2'
import { isValidBBox } from '../utils/bbox'

export class StacApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'StacApiError'
    this.status = status
  }
}

async function parseError(res: Response): Promise<never> {
  let detail = ''
  try {
    const body = await res.json()
    detail = (body && (body.description || body.detail || body.message)) || ''
  } catch {
    /* non-JSON body */
  }
  throw new StacApiError(
    `STAC API error (${res.status} ${res.statusText})${detail ? `: ${detail}` : ''}`,
    res.status,
  )
}

interface CollectionsPage {
  collections?: StacCollection[]
  links?: StacLink[]
}

/**
 * Loads the full list of available collections.
 * The endpoint is paginated (default 10, "next" link via offset): we follow the
 * links until exhausted, with a safety cap on the number of pages.
 */
export async function getCollections(signal?: AbortSignal): Promise<StacCollection[]> {
  const all: StacCollection[] = []
  const seen = new Set<string>()
  let url: string | null = `${STAC_BASE_URL}/collections?limit=100`
  let pages = 0

  while (url && pages < 50) {
    const res: Response = await fetch(url, { headers: { Accept: 'application/json' }, signal })
    if (!res.ok) await parseError(res)
    const data = (await res.json()) as CollectionsPage
    for (const c of data.collections ?? []) {
      if (!seen.has(c.id)) {
        seen.add(c.id)
        all.push(c)
      }
    }
    const next = data.links?.find((l) => l.rel === 'next')?.href
    url = next ? rewriteForProxy(next) : null
    pages++
  }
  return all
}

/** Builds the POST /search request body from the app parameters. */
export function buildSearchBody(params: SearchParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    limit: params.limit,
  }

  if (params.collections.length > 0) body.collections = params.collections

  if (isValidBBox(params.bbox)) body.bbox = params.bbox

  const from = params.dateFrom?.trim()
  const to = params.dateTo?.trim()
  if (from || to) {
    body.datetime = `${from || '..'}/${to || '..'}`
  }

  const filter = buildCql2Filter({ maxCloudCover: params.maxCloudCover })
  if (filter) {
    body.filter = filter
    body['filter-lang'] = 'cql2-json'
  }

  if (params.sortby) {
    body.sortby = [{ field: params.sortby.field, direction: params.sortby.direction }]
  }

  return body
}

export interface SearchResult {
  items: StacItem[]
  matched?: number
  // Link to the next page, if present (handled by fetchNext).
  next?: StacLink
}

function findNextLink(fc: StacItemCollection): StacLink | undefined {
  return fc.links?.find((l) => l.rel === 'next')
}

function toResult(fc: StacItemCollection): SearchResult {
  return {
    items: fc.features ?? [],
    matched: fc.numberMatched ?? fc.context?.matched,
    next: findNextLink(fc),
  }
}

/** Runs a new search (POST /search). */
export async function search(params: SearchParams, signal?: AbortSignal): Promise<SearchResult> {
  const res = await fetch(`${STAC_BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(buildSearchBody(params)),
    signal,
  })
  if (!res.ok) await parseError(res)
  return toResult((await res.json()) as StacItemCollection)
}

/**
 * Follows a "next" pagination link. The STAC link can be GET or POST:
 * - method POST: re-issues the POST to href with the provided body (merged with
 *   the previous one when merge=true).
 * - otherwise: a plain GET on href.
 */
export async function fetchNext(
  next: StacLink,
  prevBody: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const isPost = (next.method || 'GET').toUpperCase() === 'POST'
  // The dev proxy runs against the stac.dataspace... host; the "next" hrefs are
  // absolute to that host. In dev we rewrite them to go through the /stac proxy.
  const href = rewriteForProxy(next.href)

  let res: Response
  if (isPost) {
    const body = next.merge ? { ...prevBody, ...(next.body ?? {}) } : next.body ?? prevBody
    res = await fetch(href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } else {
    res = await fetch(href, { headers: { Accept: 'application/json' }, signal })
  }
  if (!res.ok) await parseError(res)
  return toResult((await res.json()) as StacItemCollection)
}

/** In development, rewrites absolute API URLs to go through the Vite proxy. */
function rewriteForProxy(href: string): string {
  if (!import.meta.env.DEV) return href
  try {
    const u = new URL(href, window.location.origin)
    if (u.hostname === 'stac.dataspace.copernicus.eu') {
      return `/stac${u.pathname}${u.search}`
    }
    return href
  } catch {
    return href
  }
}
