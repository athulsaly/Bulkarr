'use client'
import { useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ReviewRow, DefaultsConfig, Cache } from '@/lib/types'
import { ReviewRowComponent } from './ReviewRow'
import { ReviewCard } from './ReviewCard'

interface Props {
  rows: ReviewRow[]
  defaults: DefaultsConfig
  cache: Cache
  target: 'movies' | 'series'
  cardView?: boolean
  onUpdateRow: (id: string, patch: Partial<ReviewRow>) => void
  onDeleteRow: (id: string) => void
  onToggleAll: (included: boolean) => void
}

const ROW_HEIGHT = 56
const VIRTUAL_THRESHOLD = 100

export function ReviewTable({ rows, defaults, cache, target, cardView, onUpdateRow, onDeleteRow, onToggleAll }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const masterRef = useRef<HTMLInputElement>(null)
  const shouldVirtualize = !cardView && rows.length > VIRTUAL_THRESHOLD

  const selectableRows = rows.filter(r => r.status !== 'no_match' && r.status !== 'in_library')
  const allIncluded = selectableRows.length > 0 && selectableRows.every(r => r.included)
  const someIncluded = selectableRows.some(r => r.included)

  useEffect(() => {
    if (masterRef.current) {
      masterRef.current.indeterminate = someIncluded && !allIncluded
    }
  }, [someIncluded, allIncluded])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    enabled: shouldVirtualize,
  })

  if (!rows.length) return null

  const masterCheckbox = (
    <input
      ref={masterRef}
      type="checkbox"
      checked={allIncluded}
      onChange={e => onToggleAll(e.target.checked)}
      className="accent-indigo-500 w-3.5 h-3.5 cursor-pointer"
      title={allIncluded ? 'Deselect all' : 'Select all'}
    />
  )

  // ── Card grid view ──────────────────────────────────────────────────────────
  if (cardView) {
    return (
      <div className="border-t border-[#2a2a3a] px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {masterCheckbox}
          <span
            className="cursor-pointer hover:text-slate-300 transition-colors"
            onClick={() => onToggleAll(!allIncluded)}
          >
            {allIncluded ? 'Deselect all' : 'Select all'} ({rows.length})
          </span>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {rows.map(row => (
            <ReviewCard
              key={row.id}
              row={row}
              defaults={defaults}
              cache={cache}
              target={target}
              onUpdate={patch => onUpdateRow(row.id, patch)}
              onDelete={() => onDeleteRow(row.id)}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Table view ──────────────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-[#0f0f12] border-b border-[#2a2a3a] text-xs text-slate-500 uppercase tracking-wide sticky top-0 z-10">
      <span className="shrink-0">{masterCheckbox}</span>
      <span className="w-36 shrink-0">Input</span>
      <span className="flex-1">Match</span>
      <span className="shrink-0">Status / Overrides</span>
    </div>
  )

  if (!shouldVirtualize) {
    return (
      <div className="border-t border-[#2a2a3a]">
        {header}
        {rows.map(row => (
          <ReviewRowComponent
            key={row.id}
            row={row}
            defaults={defaults}
            cache={cache}
            target={target}
            onUpdate={patch => onUpdateRow(row.id, patch)}
            onDelete={() => onDeleteRow(row.id)}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="border-t border-[#2a2a3a] flex flex-col" style={{ height: '60vh' }}>
      {header}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(vItem => (
            <ReviewRowComponent
              key={rows[vItem.index].id}
              row={rows[vItem.index]}
              defaults={defaults}
              cache={cache}
              target={target}
              onUpdate={patch => onUpdateRow(rows[vItem.index].id, patch)}
              onDelete={() => onDeleteRow(rows[vItem.index].id)}
              style={{
                position: 'absolute',
                top: vItem.start,
                left: 0,
                right: 0,
                height: vItem.size,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
