'use client'
import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ReviewRow, DefaultsConfig, Cache } from '@/lib/types'
import { ReviewRowComponent } from './ReviewRow'

interface Props {
  rows: ReviewRow[]
  defaults: DefaultsConfig
  cache: Cache
  target: 'movies' | 'series'
  onUpdateRow: (id: string, patch: Partial<ReviewRow>) => void
  onDeleteRow: (id: string) => void
}

const ROW_HEIGHT = 56
const VIRTUAL_THRESHOLD = 100

export function ReviewTable({ rows, defaults, cache, target, onUpdateRow, onDeleteRow }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = rows.length > VIRTUAL_THRESHOLD

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    enabled: shouldVirtualize,
  })

  if (!rows.length) return null

  const header = (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 border-b border-slate-700 text-xs text-slate-500 uppercase tracking-wide sticky top-0 z-10">
      <span className="w-4 shrink-0" />
      <span className="w-36 shrink-0">Input</span>
      <span className="flex-1">Match</span>
      <span className="shrink-0">Status / Overrides</span>
    </div>
  )

  if (!shouldVirtualize) {
    return (
      <div className="border-t border-slate-700">
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
    <div className="border-t border-slate-700 flex flex-col" style={{ height: '60vh' }}>
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
