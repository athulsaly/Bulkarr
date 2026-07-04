'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/Spinner'
import { StatCard } from '@/components/StatCard'
import type { HistoryItem } from '@/lib/types'

interface DashboardData {
  movies: number
  series: number
  activeRules: number
  pendingQueue: number
  recentHistory: HistoryItem[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ movies: 0, series: 0, activeRules: 0, pendingQueue: 0, recentHistory: [] }))
  }, [])

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
    </div>
  )
}
