'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/Spinner'
import { StatCard } from '@/components/StatCard'
import { useToast } from '@/hooks/useToast'
import { ToastStack } from '@/components/ToastStack'
import type { HistoryItem, WatchedEvent, AutoDeleteRule, NowPlayingItem } from '@/lib/types'

interface DashboardData {
  movies: number
  series: number
  activeRules: number
  pendingQueue: number
  recentHistory: HistoryItem[]
  recentWatched: WatchedEvent[]
  nowPlaying: NowPlayingItem[]
}

function delayLabel(r: AutoDeleteRule): string {
  return r.delayUnit === 'year'
    ? `${r.delayAmount} year${r.delayAmount === 1 ? '' : 's'}`
    : `${r.delayAmount} ${r.delayUnit}`
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [rules, setRules] = useState<AutoDeleteRule[]>([])
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [enqueueing, setEnqueueing] = useState<string | null>(null)
  const { toasts, addToast, dismiss } = useToast()

  useEffect(() => {
    // Fetch rules once — they don't change frequently
    fetch('/api/rules')
      .then(r => r.json())
      .then((d: { rules: AutoDeleteRule[] }) => setRules(d.rules ?? []))
      .catch(() => setRules([]))
  }, [])

  useEffect(() => {
    const fetchDashboard = () => {
      fetch('/api/dashboard')
        .then(r => r.json())
        .then((dash: DashboardData) => setData(dash))
        .catch(() => {
          setData({ movies: 0, series: 0, activeRules: 0, pendingQueue: 0, recentHistory: [], recentWatched: [], nowPlaying: [] })
        })
    }
    fetchDashboard()
    const id = setInterval(fetchDashboard, 15_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!openDropdown) return
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest(`[data-dropdown-id="${openDropdown}"]`)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openDropdown])

  const handleApplyRule = async (event: WatchedEvent, rule: AutoDeleteRule) => {
    setOpenDropdown(null)
    setEnqueueing(event.id)
    try {
      const res = await fetch('/api/deletion-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchedEventId: event.id, ruleId: rule.id }),
      })
      const displayTitle = event.mediaType === 'episode'
        ? (event.seriesTitle ?? event.title)
        : event.title
      if (res.ok) {
        addToast(`Queued: ${rule.action} — ${displayTitle}`, 'success')
      } else {
        addToast('Failed to enqueue', 'error')
      }
    } catch {
      addToast('Failed to enqueue', 'error')
    } finally {
      setEnqueueing(null)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>

      {!data ? (
        <div className="flex items-center justify-center h-40">
          <Spinner className="w-6 h-6 text-indigo-400" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon="🎬" label="Movies" value={data.movies} />
            <StatCard icon="📺" label="Series" value={data.series} />
            <StatCard icon="⚡" label="Active Rules" value={data.activeRules} accent />
            <StatCard icon="⏳" label="Queue Pending" value={data.pendingQueue} />
          </div>

          {/* Now Playing */}
          {(() => {
            const active = data.nowPlaying.filter(i => Date.now() - i.updatedAt < 600_000)
            return (
              <div>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  {active.length > 0 ? (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full h-2 w-2 bg-slate-700" />
                  )}
                  Now Playing
                </h2>
                <div className="rounded-xl border border-[#2a2a3a] bg-[#1c1c28] divide-y divide-[#2a2a3a]">
                  {active.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-slate-500">
                      Nothing playing right now.{' '}
                      <Link href="/settings" className="text-indigo-400 hover:text-indigo-300">
                        Configure your media server webhook →
                      </Link>
                    </div>
                  ) : active.map(item => {
                    const displayTitle = item.mediaType === 'episode'
                      ? (item.seriesTitle ?? item.title)
                      : item.title
                    const episodeSuffix =
                      item.mediaType === 'episode' &&
                      item.seasonNumber != null &&
                      item.episodeNumber != null
                        ? ` · S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}`
                        : null
                    return (
                      <div key={item.sessionId} className="flex items-center gap-3 px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                          item.mediaType === 'movie'
                            ? 'bg-blue-900/50 text-blue-300'
                            : 'bg-purple-900/50 text-purple-300'
                        }`}>
                          {item.mediaType === 'movie' ? 'Movie' : 'Series'}
                        </span>
                        <span className="text-slate-100 text-sm font-medium truncate">
                          {displayTitle}
                          {episodeSuffix && (
                            <span className="text-slate-400 font-normal">{episodeSuffix}</span>
                          )}
                        </span>
                        <span className="ml-auto text-slate-500 text-xs shrink-0">
                          {item.progressPct > 0 ? `${Math.round(item.progressPct)}%` : ''}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 shrink-0">
                          {item.mediaServer}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Recently Played */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Recently Played</h2>
            <div className="rounded-xl border border-[#2a2a3a] bg-[#1c1c28] divide-y divide-[#2a2a3a]">
              {data.recentWatched.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-500">
                  No watch history yet. Webhooks from Jellyfin or Plex will appear here.{' '}
                  <Link href="/settings" className="text-indigo-400 hover:text-indigo-300">
                    Settings →
                  </Link>
                </div>
              ) : data.recentWatched.map(event => {
                const applicableRules = rules.filter(r =>
                  r.enabled && (event.mediaType === 'movie' ? r.mediaType === 'movie' : r.mediaType === 'series')
                )
                const displayTitle = event.mediaType === 'episode'
                  ? (event.seriesTitle ?? event.title)
                  : event.title
                const episodeSuffix =
                  event.mediaType === 'episode' &&
                  event.seasonNumber != null &&
                  event.episodeNumber != null
                    ? ` · S${String(event.seasonNumber).padStart(2, '0')}E${String(event.episodeNumber).padStart(2, '0')}`
                    : null

                return (
                  <div key={event.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      event.mediaType === 'movie'
                        ? 'bg-blue-900/50 text-blue-300'
                        : 'bg-purple-900/50 text-purple-300'
                    }`}>
                      {event.mediaType === 'movie' ? 'Movie' : 'Series'}
                    </span>
                    <span className="text-slate-100 text-sm font-medium truncate">
                      {displayTitle}
                      {episodeSuffix && (
                        <span className="text-slate-400 font-normal">{episodeSuffix}</span>
                      )}
                    </span>
                    <span className="ml-auto text-slate-600 text-xs shrink-0">
                      {new Date(event.watchedAt).toLocaleDateString()}
                    </span>
                    {event.matchStatus === 'matched' ? (
                      <div
                        className="relative shrink-0"
                        data-dropdown-id={event.id}
                      >
                        <button
                          onClick={() => setOpenDropdown(openDropdown === event.id ? null : event.id)}
                          disabled={enqueueing === event.id}
                          className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs rounded-lg px-2.5 py-1 disabled:opacity-50"
                        >
                          {enqueueing === event.id
                            ? <Spinner className="w-3 h-3" />
                            : <span>⚡</span>}
                          <span>{enqueueing === event.id ? 'Queuing…' : 'Apply rule'}</span>
                          {enqueueing !== event.id && <span className="text-slate-500">▾</span>}
                        </button>
                        {openDropdown === event.id && (
                          <div className="absolute right-0 top-full mt-1 w-64 bg-[#1c1c28] border border-[#2a2a3a] rounded-xl shadow-xl z-10 py-1">
                            {applicableRules.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-slate-500">
                                No rules configured.{' '}
                                <Link href="/rules" className="text-indigo-400 hover:text-indigo-300">
                                  Add one →
                                </Link>
                              </div>
                            ) : (
                              applicableRules.map(rule => (
                                <button
                                  key={rule.id}
                                  onClick={() => handleApplyRule(event, rule)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-white/5 text-left"
                                >
                                  <span className="font-medium truncate">{rule.name}</span>
                                  <span className={`ml-auto shrink-0 ${rule.action === 'delete' ? 'text-red-400' : 'text-blue-400'}`}>
                                    {rule.action}
                                  </span>
                                  <span className="text-slate-500 shrink-0">{delayLabel(rule)}</span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#2a2a3a] text-slate-500 shrink-0">
                        {event.matchStatus}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Quick Start</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                href="/add/movies"
                className="flex items-center gap-3 p-4 rounded-xl border border-[#2a2a3a] bg-[#1c1c28] hover:border-indigo-500/50 transition-colors group"
              >
                <span className="text-2xl">🎬</span>
                <div>
                  <p className="text-slate-100 font-medium group-hover:text-indigo-300 transition-colors">Add Movies →</p>
                  <p className="text-slate-500 text-sm">Paste titles to bulk-add to Radarr</p>
                </div>
              </Link>
              <Link
                href="/add/series"
                className="flex items-center gap-3 p-4 rounded-xl border border-[#2a2a3a] bg-[#1c1c28] hover:border-indigo-500/50 transition-colors group"
              >
                <span className="text-2xl">📺</span>
                <div>
                  <p className="text-slate-100 font-medium group-hover:text-indigo-300 transition-colors">Add Series →</p>
                  <p className="text-slate-500 text-sm">Paste titles to bulk-add to Sonarr</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Recent activity */}
          {data.recentHistory.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Recent Additions</h2>
              <div className="rounded-xl border border-[#2a2a3a] bg-[#1c1c28] divide-y divide-[#2a2a3a]">
                {data.recentHistory.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      item.target === 'movies'
                        ? 'bg-blue-900/50 text-blue-300'
                        : 'bg-purple-900/50 text-purple-300'
                    }`}>
                      {item.target === 'movies' ? 'Movie' : 'Series'}
                    </span>
                    <span className="text-slate-100 text-sm font-medium">{item.title}</span>
                    {item.year && <span className="text-slate-500 text-xs">{item.year}</span>}
                    <span className="ml-auto text-slate-600 text-xs">
                      {new Date(item.addedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
