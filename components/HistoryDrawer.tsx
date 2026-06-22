'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Spinner } from './Spinner'
import type { HistoryItem } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function HistoryDrawer({ open, onClose }: Props) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [filter, setFilter] = useState<'all' | 'movies' | 'series'>('all')
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/history')
      .then(r => r.json())
      .then(d => setHistory(d.history ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  const handleClear = async () => {
    await fetch('/api/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setHistory([])
  }

  const handleRemove = async (id: string) => {
    await fetch('/api/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setHistory(prev => prev.filter(h => h.id !== id))
  }

  const visible = filter === 'all' ? history : history.filter(h => h.target === filter)

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} />}
      <div className={`fixed top-0 left-0 z-40 h-full w-96 bg-slate-800 border-r border-slate-700 shadow-xl transform transition-transform duration-200 flex flex-col ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <span className="font-semibold text-sm">Added History</span>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button onClick={handleClear} className="text-xs text-red-400 hover:text-red-300 transition-colors">Clear all</button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-slate-700 shrink-0">
          {(['all', 'movies', 'series'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${filter === t ? 'text-orange-400 border-b-2 border-orange-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t === 'all' ? `All (${history.length})` : `${t.charAt(0).toUpperCase() + t.slice(1)} (${history.filter(h => h.target === t).length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Spinner className="w-5 h-5 text-slate-500" /></div>}
          {!loading && visible.length === 0 && (
            <p className="text-center text-slate-600 text-sm py-12">No history yet</p>
          )}
          {visible.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-700/50 hover:bg-slate-700/30 group">
              <div className="w-8 h-12 bg-slate-700 rounded overflow-hidden shrink-0 relative">
                {item.remotePoster ? (
                  <Image src={item.remotePoster} alt={item.title} fill sizes="32px" className="object-cover" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-bold">
                    {item.title.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.title}</p>
                <p className="text-xs text-slate-500">
                  {item.year ? `${item.year} · ` : ''}{item.target === 'movies' ? 'Movie' : 'Series'} · {formatDate(item.addedAt)}
                </p>
              </div>
              <button
                onClick={() => handleRemove(item.id)}
                className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm leading-none shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
