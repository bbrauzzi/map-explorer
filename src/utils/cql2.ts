// Building CQL2 (JSON) filters for the STAC search.
// See: https://docs.ogc.org/DRAFTS/21-065.html (CQL2-JSON)

export type Cql2Filter = Record<string, unknown>

/**
 * Builds a CQL2-JSON filter from the supported criteria.
 * Currently: maximum cloud cover (eo:cloud_cover <= N).
 * Returns undefined if there is no criterion to apply.
 */
export function buildCql2Filter(opts: { maxCloudCover?: number }): Cql2Filter | undefined {
  const predicates: Cql2Filter[] = []

  if (typeof opts.maxCloudCover === 'number' && !Number.isNaN(opts.maxCloudCover)) {
    predicates.push({
      op: '<=',
      args: [{ property: 'eo:cloud_cover' }, opts.maxCloudCover],
    })
  }

  if (predicates.length === 0) return undefined
  if (predicates.length === 1) return predicates[0]
  return { op: 'and', args: predicates }
}
