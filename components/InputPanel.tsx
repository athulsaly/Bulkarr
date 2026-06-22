'use client'

interface Props {
  value: string
  onChange: (v: string) => void
  onLookup: () => void
  running: boolean
  progress: { done: number; total: number } | null
}

function lineCount(s: string) {
  return s.split('\n').map(l => l.trim()).filter(Boolean).length
}

export function InputPanel({ value, onChange, onLookup, running, progress }: Props) {
  const count = lineCount(value)

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">Paste titles — one per line</span>
        {count > 0 && (
          <span className="text-xs bg-slate-700 text-slate-300 rounded px-2 py-0.5">{count} title{count !== 1 ? 's' : ''}</span>
        )}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Inception&#10;The Dark Knight&#10;Interstellar"
        className="w-full h-40 rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-600 resize-none focus:outline-none focus:border-orange-500"
      />
      {progress && (
        <div className="h-1.5 w-full bg-slate-700 rounded overflow-hidden">
          <div
            className="h-full bg-orange-500 transition-all duration-200"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
      <button
        onClick={onLookup}
        disabled={count === 0 || running}
        className="rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-1.5 text-sm font-medium transition-colors"
      >
        {running ? 'Looking up…' : 'Parse & Look Up'}
      </button>
    </div>
  )
}
