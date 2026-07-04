'use client'
import { useState, useEffect, useCallback } from 'react'
import { Spinner } from './Spinner'
import type { WatchedEvent, MediaServerType } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onUnmatchedCountChange?: (n: number) => void
}

function formatAge(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const SERVER_BADGE: Record<MediaServerType, { label: string; cls: string }> = {
  jellyfin: { label: 'J', cls: 'bg-purple-800 text-purple-200' },
  plex: { label: 'P', cls: 'bg-yellow-700 text-yellow-100' },
}

const MATCH_CHIP: Record<WatchedEvent['matchStatus'], { label: string; cls: string }> = {
  matched:   { label: '→ Matched',  cls: 'bg-green-800 text-green-200' },
  unmatched: { label: 'Unmatched',  cls: 'bg-red-900 text-red-300' },
  pending:   { label: 'Pending',    cls: 'bg-white/10 text-slate-400' },
}

type Filter = 'all' | 'jellyfin' | 'plex' | 'movies' | 'episodes'

export function WatchedDrawer({ open, onClose, onUnmatchedCountChange }: Props) {
  const [events, setEvents] = useState<WatchedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [rematching, setRematching] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [executing, setExecuting] = useState<Record<string, 'running' | 'done' | 'error' | 'noop'>>({})

  const handleExecuteEvent = async (eventId: string) => {
    setExecuting(prev => ({ ...prev, [eventId]: 'running' }))
    try {
      const res = await fetch('/api/deletion-queue/execute-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchedEventId: eventId }),
      })
      const data = await res.json() as { executed: number }
      setExecuting(prev => ({
        ...prev,
        [eventId]: !res.ok ? 'error' : data.executed > 0 ? 'done' : 'noop',
      }))
    } catch {
      setExecuting(prev => ({ ...prev, [eventId]: 'error' }))
    }
  }

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/watched')
      .then(r => r.json())
      .then((d: { events: WatchedEvent[] }) => {
        const evs = d.events ?? []
        setEvents(evs)
        onUnmatchedCountChange?.(evs.filter(e => e.matchStatus !== 'matched').length)
      })
      .finally(() => setLoading(false))
  }, [onUnmatchedCountChange])

  useEffect(() => { if (open) load() }, [open, load])

  const handleClear = async () => {
    await fetch('/api/watched', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setEvents([])
    onUnmatchedCountChange?.(0)
  }

  const handleRemove = async (id: string) => {
    await fetch('/api/watched', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setEvents(prev => {
      const next = prev.filter(e => e.id !== id)
      onUnmatchedCountChange?.(next.filter(e => e.matchStatus !== 'matched').length)
      return next
    })
  }

  const handleRematch = async () => {
    setRematching(true)
    try {
      const res = await fetch('/api/watched/rematch', { method: 'POST' })
      const { updated } = await res.json() as { updated: number }
      if (updated > 0) load()
    } finally {
      setRematching(false)
    }
  }

  const counts = {
    all: events.length,
    jellyfin: events.filter(e => e.mediaServer === 'jellyfin').length,
    plex: events.filter(e => e.mediaServer === 'plex').length,
    movies: events.filter(e => e.mediaType === 'movie').length,
    episodes: events.filter(e => e.mediaType === 'episode').length,
  }

  const visible = events.filter(e => {
    if (filter === 'jellyfin') return e.mediaServer === 'jellyfin'
    if (filter === 'plex') return e.mediaServer === 'plex'
    if (filter === 'movies') return e.mediaType === 'movie'
    if (filter === 'episodes') return e.mediaType === 'episode'
    return true
  })

  const unmatchedCount = events.filter(e => e.matchStatus !== 'matched').length

  const TABS: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'jellyfin', label: `Jellyfin (${counts.jellyfin})` },
    { key: 'plex', label: `Plex (${counts.plex})` },
    { key: 'movies', label: `Movies (${counts.movies})` },
    { key: 'episodes', label: `Episodes (${counts.episodes})` },
  ]

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} />}
      <div className={`fixed top-0 left-0 z-40 h-full w-[26rem] bg-[#1c1c28] border-r border-[#2a2a3a] shadow-xl transform transition-transform duration-200 flex flex-col ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a3a] shrink-0">
          <span className="font-semibold text-sm">Watched Events</span>
          <div className="flex items-center gap-2">
            {unmatchedCount > 0 && (
              <button
                onClick={handleRematch}
                disabled={rematching}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
              >
                {rematching && <Spinner className="w-3 h-3" />}
                Re-match ({unmatchedCount})
              </button>
            )}
            {events.length > 0 && (
              <button onClick={handleClear} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                Clear all
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
          </div>
        </div>

        <div className="flex border-b border-[#2a2a3a] shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`shrink-0 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${filter === t.key ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Spinner className="w-5 h-5 text-slate-500" /></div>}
          {!loading && visible.length === 0 && (
            <p className="text-center text-slate-600 text-sm py-12">No watched events yet</p>
          )}
          {visible.map(ev => {
            const badge = SERVER_BADGE[ev.mediaServer]
            const chip = MATCH_CHIP[ev.matchStatus]
            return (
              <div key={ev.id} className="flex items-start gap-3 px-4 py-3 border-b border-[#2a2a3a]/50 hover:bg-white/5 group">
                <span className={`shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center mt-0.5 ${badge.cls}`}>
                  {badge.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ev.title}</p>
                  {ev.mediaType === 'episode' && ev.seriesTitle && (
                    <p className="text-xs text-slate-500 truncate">
                      {ev.seriesTitle} · S{String(ev.seasonNumber ?? 0).padStart(2, '0')}E{String(ev.episodeNumber ?? 0).padStart(2, '0')}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${chip.cls}`}>{chip.label}</span>
                    <span className="text-xs text-slate-600">{Math.round(ev.progressPct)}%</span>
                    <span className="text-xs text-slate-600">·</span>
                    <span className="text-xs text-slate-600">{formatAge(ev.watchedAt)}</span>
                  </div>
                </div>
                {ev.matchStatus === 'matched' && (
                  <button
                    onClick={() => handleExecuteEvent(ev.id)}
                    disabled={executing[ev.id] === 'running'}
                    title={
                      executing[ev.id] === 'done' ? 'Executed' :
                      executing[ev.id] === 'error' ? 'Failed' :
                      executing[ev.id] === 'noop' ? 'No matching rules' :
                      'Delete now via rules'
                    }
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      executing[ev.id] === 'done' ? 'bg-green-800 text-green-200' :
                      executing[ev.id] === 'error' ? 'bg-red-900 text-red-300' :
                      executing[ev.id] === 'noop' ? 'bg-white/10 text-slate-400' :
                      'bg-amber-700 hover:bg-amber-600 text-white'
                    } disabled:opacity-50`}
                  >
                    {executing[ev.id] === 'running' ? '…' :
                     executing[ev.id] === 'done' ? '✓' :
                     executing[ev.id] === 'error' ? '!' :
                     executing[ev.id] === 'noop' ? '–' :
                     '⚡'}
                  </button>
                )}
                <button
                  onClick={() => handleRemove(ev.id)}
                  className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm leading-none shrink-0 mt-0.5"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
