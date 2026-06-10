import { useEffect, useMemo, useRef, useState } from 'react'
import type { StacItem } from '../types/stac'
import { itemTime } from './ItemDetail'

interface Props {
  items: StacItem[]
  // Reports the ids visible at the current time position (cumulative up to the
  // slider). MapView filters footprints/overlays to this set.
  onWindowChange: (ids: Set<string> | null) => void
}

const STEP_MS = 600

function fmt(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

export default function TimeSlider({ items, onWindowChange }: Props) {
  // Timed items sorted ascending; the slider stops on each acquisition time so
  // every step reveals at least one new item.
  const timed = useMemo(() => {
    return items
      .map((it) => ({ id: it.id, t: itemTime(it) }))
      .filter((x): x is { id: string; t: number } => x.t != null)
      .sort((a, b) => a.t - b.t)
  }, [items])

  const stops = useMemo(() => [...new Set(timed.map((x) => x.t))], [timed])
  const last = Math.max(0, stops.length - 1)

  const [idx, setIdx] = useState(last)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset to "all visible" whenever the result set changes.
  useEffect(() => {
    setIdx(last)
    setPlaying(false)
  }, [last])

  // Active ids = everything acquired at or before the current stop (coverage builds up).
  const activeIds = useMemo(() => {
    if (stops.length === 0) return null
    const cutoff = stops[Math.min(idx, last)]
    return new Set(timed.filter((x) => x.t <= cutoff).map((x) => x.id))
  }, [timed, stops, idx, last])

  useEffect(() => {
    onWindowChange(activeIds)
  }, [activeIds, onWindowChange])

  // Play loop: advance one stop per tick, stop at the end.
  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => {
      setIdx((i) => {
        if (i >= last) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, STEP_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [playing, last])

  const togglePlay = () => {
    if (!playing && idx >= last) setIdx(0) // restart from the beginning
    setPlaying((p) => !p)
  }

  if (stops.length < 2) {
    return (
      <div className="absolute bottom-[14px] left-1/2 z-[5] -translate-x-1/2 rounded-md border border-border bg-bg/90 px-3 py-2 text-xs text-muted">
        Not enough dated results to animate.
      </div>
    )
  }

  return (
    <div className="absolute bottom-[14px] left-1/2 z-[5] flex w-[min(560px,80%)] -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-bg/90 px-3 py-2 text-xs">
      <button
        title="Step back"
        onClick={() => {
          setPlaying(false)
          setIdx((i) => Math.max(0, i - 1))
        }}
      >
        ◀
      </button>
      <button title={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button
        title="Step forward"
        onClick={() => {
          setPlaying(false)
          setIdx((i) => Math.min(last, i + 1))
        }}
      >
        ▶
      </button>
      <input
        type="range"
        className="flex-1"
        min={0}
        max={last}
        value={idx}
        onChange={(e) => {
          setPlaying(false)
          setIdx(Number(e.target.value))
        }}
      />
      <span className="w-[150px] shrink-0 text-right tabular-nums">
        {fmt(stops[idx])} · {activeIds?.size ?? 0}/{timed.length}
      </span>
    </div>
  )
}
