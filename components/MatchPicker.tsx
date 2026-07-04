'use client'
import type { ArrItem } from '@/lib/types'

interface Props {
  candidates: ArrItem[]
  selectedIndex: number
  onChange: (index: number) => void
  className?: string
}

export function MatchPicker({ candidates, selectedIndex, onChange, className }: Props) {
  if (candidates.length <= 1) return null
  return (
    <select
      value={selectedIndex}
      onChange={e => onChange(Number(e.target.value))}
      className={className ?? 'text-xs rounded bg-white/5 border border-white/10 px-1.5 py-0.5 focus:outline-none focus:border-indigo-500/60 max-w-[180px]'}
    >
      {candidates.map((c, i) => (
        <option key={i} value={i}>{c.title} {c.year ? `(${c.year})` : ''}</option>
      ))}
    </select>
  )
}
