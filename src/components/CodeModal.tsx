import { useMemo, useState } from 'react'
import type { SearchParams } from '../types/stac'
import { toCurl, toPython } from '../utils/codegen'
import { stamp, triggerDownload } from '../utils/export'

interface Props {
  params: SearchParams | null
  onClose: () => void
}

type Tab = 'python' | 'curl'

const TABS: { key: Tab; label: string; lang: string; file: (s: string) => string; mime: string }[] = [
  { key: 'python', label: 'Python (pystac-client)', lang: 'python', file: (s) => `stac-search-${s}.py`, mime: 'text/x-python' },
  { key: 'curl', label: 'curl', lang: 'bash', file: (s) => `stac-search-${s}.sh`, mime: 'text/x-shellscript' },
]

export default function CodeModal({ params, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('python')
  const [copied, setCopied] = useState(false)

  // Generate both snippets once per params change.
  const snippets = useMemo<Record<Tab, string>>(
    () => ({
      python: params ? toPython(params) : '',
      curl: params ? toCurl(params) : '',
    }),
    [params],
  )

  const active = TABS.find((t) => t.key === tab)!
  const code = snippets[tab]

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (e.g. insecure context) */
    }
  }

  const tabBtn = (t: Tab) =>
    `px-2.5 py-1 text-xs ${tab === t ? 'border-accent text-accent' : ''}`

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-[760px] overflow-y-auto rounded-[10px] border border-border bg-panel px-5 py-[18px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="float-right" onClick={onClose}>
          ✕ Close
        </button>
        <h2 className="m-0 mb-1 text-base">Reproduce this search in code</h2>
        <p className="hint mb-3">
          Generated from the last search you ran, against{' '}
          <code>stac.dataspace.copernicus.eu</code>.
        </p>

        <div className="mb-2 flex items-center gap-1.5">
          {TABS.map((t) => (
            <button key={t.key} className={tabBtn(t.key)} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
          <span className="flex-1" />
          <button onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
          <button onClick={() => triggerDownload(code, active.file(stamp()), active.mime)}>
            Download
          </button>
        </div>

        {params ? (
          <pre className="mt-1 max-h-[55vh] overflow-auto rounded-md border border-border bg-bg p-3 text-[12px] leading-relaxed">
            {code}
          </pre>
        ) : (
          <div className="rounded-md border border-border bg-bg p-4 text-center text-[13px] text-muted">
            Run a search first to generate code.
          </div>
        )}
      </div>
    </div>
  )
}
