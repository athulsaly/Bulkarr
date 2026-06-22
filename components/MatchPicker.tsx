'use client'
import type { ArrItem } from '@/lib/types'

interface Props {
  candidates: ArrItem[]
  selectedIndex: number
  onChange: (index: number) => void
}

export function MatchPicker({ candidates, selectedIndex, onChange }: Props) {
  if (candidates.length <= 1) return null
  return (
    <select
      value={selectedIndex}
      onChange={e => onChange(Number(e.target.value))}
      className="text-xs rounded bg-slate-700 border border-slate-600 px-1.5 py-0.5 focus:outline-none focus:border-orange-500 max-w-[180px]"
    >
      {candidates.map((c, i) => (
        <option key={i} value={i}>{c.title} {c.year ? `(${c.year})` : ''}</option>
      ))}
    </select>
  )
}
