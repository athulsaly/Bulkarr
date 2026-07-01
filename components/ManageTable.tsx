'use client'
import { useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ManageRow } from '@/lib/types'
import { ManageRowComponent } from './ManageRow'

interface Props {
  rows: ManageRow[]
  onUpdateRow: (id: string, patch: Partial<ManageRow>) => void
  onDeleteRow: (id: string) => void
  onToggleAll: (included: boolean) => void
}

const ROW_HEIGHT = 56
const VIRTUAL_THRESHOLD = 100

export function ManageTable({ rows, onUpdateRow, onDeleteRow, onToggleAll }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const masterRef = useRef<HTMLInputElement>(null)
  const shouldVirtualize = rows.length > VIRTUAL_THRESHOLD

  const matchedRows = rows.filter(r => r.status === 'matched')
  const allMatched = matchedRows.length > 0
  const someMatched = matchedRows.length > 0

  useEffect(() => {
    if (masterRef.current) {
      masterRef.current.indeterminate = false
    }
  }, [someMatched, allMatched])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    enabled: shouldVirtualize,
  })

  if (!rows.length) return null

  const header = (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 border-b border-slate-700 text-xs text-slate-500 uppercase tracking-wide sticky top-0 z-10">
      <span className="shrink-0 w-3.5" />
      <span className="w-36 shrink-0">Input</span>
      <span className="flex-1">Library Match</span>
      <span className="shrink-0">Status / Action</span>
    </div>
  )

  if (!shouldVirtualize) {
    return (
      <div className="border-t border-slate-700">
        {header}
        {rows.map(row => (
          <ManageRowComponent
            key={row.id}
            row={row}
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
            <ManageRowComponent
              key={rows[vItem.index].id}
              row={rows[vItem.index]}
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
