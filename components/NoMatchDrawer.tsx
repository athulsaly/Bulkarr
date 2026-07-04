'use client'
import type { ReviewRow } from '@/lib/types'

interface NoMatchEntry {
  row: ReviewRow
  target: 'movies' | 'series'
}

interface Props {
  open: boolean
  onClose: () => void
  entries: NoMatchEntry[]
  onRetry: (text: string, target: 'movies' | 'series') => void
  onClear: () => void
}

export function NoMatchDrawer({ open, onClose, entries, onRetry, onClear }: Props) {
  const movies = entries.filter(e => e.target === 'movies')
  const series = entries.filter(e => e.target === 'series')

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} />}
      <div className={`fixed top-0 left-0 z-40 h-full w-80 bg-[#1c1c28] border-r border-[#2a2a3a] shadow-xl transform transition-transform duration-200 flex flex-col ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a3a] shrink-0">
          <span className="font-semibold text-sm">No Matches</span>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button onClick={onClear} className="text-xs text-red-400 hover:text-red-300 transition-colors">Clear all</button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 && (
            <p className="text-center text-slate-600 text-sm py-12">No unmatched titles</p>
          )}

          {movies.length > 0 && (
            <Section label="Movies" entries={movies} onRetry={onRetry} />
          )}
          {series.length > 0 && (
            <Section label="Series" entries={series} onRetry={onRetry} />
          )}
        </div>
      </div>
    </>
  )
}

function Section({ label, entries, onRetry }: { label: string; entries: NoMatchEntry[]; onRetry: Props['onRetry'] }) {
  return (
    <div>
      <p className="px-4 py-2 text-xs font-semibold text-indigo-400 uppercase tracking-wide bg-[#0f0f12]/50">
        {label} ({entries.length})
      </p>
      {entries.map(({ row, target }) => (
        <div key={row.id} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#2a2a3a]/50 hover:bg-white/5 group">
          <span className="text-sm text-red-300 truncate flex-1" title={row.inputText}>{row.inputText}</span>
          <button
            onClick={() => { onRetry(row.inputText, target); }}
            className="text-xs text-slate-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
            title="Copy to input"
          >
            Retry
          </button>
        </div>
      ))}
    </div>
  )
}
