import { NextRequest, NextResponse } from 'next/server'
import { readStore } from '@/lib/store'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  const store = readStore()
  return NextResponse.json({
    movies: store.cache.radarr?.library.length ?? 0,
    series: store.cache.sonarr?.library.length ?? 0,
    activeRules: store.rules.filter(r => r.enabled).length,
    pendingQueue: store.deletionQueue.filter(i => i.status === 'pending').length,
    recentHistory: [...store.history]
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 5),
  })
}
