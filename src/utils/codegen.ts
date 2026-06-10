// Generates runnable code snippets that reproduce the current STAC search.
// Both helpers reuse buildSearchBody() so the snippets always match the exact
// request the app sends. Snippets target the public STAC endpoint (STAC_PUBLIC_URL),
// not the dev proxy, so they run anywhere.
import type { SearchParams } from '../types/stac'
import { buildSearchBody } from '../api/stac'
import { STAC_PUBLIC_URL } from '../config'

// Renders a JS value as a Python literal (dict / list / str / int / float / bool / None).
function toPy(value: unknown, indent = 1): string {
  const pad = '    '.repeat(indent)
  const padIn = '    '.repeat(indent + 1)
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((v) => padIn + toPy(v, indent + 1))
    return `[\n${items.join(',\n')}\n${pad}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const items = entries.map(([k, v]) => `${padIn}${JSON.stringify(k)}: ${toPy(v, indent + 1)}`)
    return `{\n${items.join(',\n')}\n${pad}}`
  }
  return 'None'
}

/** A pystac-client (Python) snippet reproducing the current search. */
export function toPython(params: SearchParams): string {
  const body = buildSearchBody(params)
  const kwargs: string[] = []
  if (Array.isArray(body.collections)) kwargs.push(`collections=${toPy(body.collections)}`)
  if (Array.isArray(body.bbox)) kwargs.push(`bbox=${toPy(body.bbox)}`)
  if (typeof body.datetime === 'string') kwargs.push(`datetime=${JSON.stringify(body.datetime)}`)
  if (body.filter) {
    kwargs.push(`filter=${toPy(body.filter)}`)
    kwargs.push('filter_lang="cql2-json"')
  }
  if (Array.isArray(body.sortby)) kwargs.push(`sortby=${toPy(body.sortby)}`)
  if (typeof body.limit === 'number') kwargs.push(`max_items=${body.limit}`)

  const args = kwargs.map((k) => `    ${k},`).join('\n')
  return `# pip install pystac-client
from pystac_client import Client

client = Client.open(${JSON.stringify(STAC_PUBLIC_URL)})
search = client.search(
${args}
)
items = list(search.items())
print(f"{len(items)} item(s) found")
`
}

/** A curl command POSTing the exact search body to /search. */
export function toCurl(params: SearchParams): string {
  const body = buildSearchBody(params)
  const json = JSON.stringify(body, null, 2)
  // Wrap the body in single quotes for the shell; escape any embedded single quote.
  const escaped = json.replace(/'/g, `'\\''`)
  return `curl -X POST "${STAC_PUBLIC_URL}/search" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '${escaped}'`
}
