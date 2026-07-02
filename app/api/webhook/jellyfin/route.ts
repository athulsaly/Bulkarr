import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { matchWatchedEvent } from '@/lib/media-matcher'
import { isDuplicate } from '@/lib/media-dedup'
import { enqueueRuleMatches } from '@/lib/deletion-executor'
import { v4 as uuidv4 } from 'uuid'
import type { WatchedEvent } from '@/lib/types'

export const runtime = 'nodejs'

interface JellyfinWebhookPayload {
  NotificationType?: string
  Item?: {
    Type?: string
    Name?: string
    ProductionYear?: number
    SeriesName?: string
    ParentIndexNumber?: number
    IndexNumber?: number
    ProviderIds?: { Tmdb?: string; Tvdb?: string }
    RunTimeTicks?: number
  }
  Session?: { PlayState?: { PositionTicks?: number } }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as JellyfinWebhookPayload | null
  if (!body || body.NotificationType !== 'PlaybackStop') return NextResponse.json({}, { status: 200 })

  const itemType = body.Item?.Type
  if (itemType !== 'Movie' && itemType !== 'Episode') return NextResponse.json({}, { status: 200 })

  const store = readStore()
  const threshold = store.settings.mediaServer.watchedThresholdPct
  const runTicks = body.Item?.RunTimeTicks ?? 0
  const posTicks = body.Session?.PlayState?.PositionTicks ?? 0
  const progressPct = runTicks > 0 ? (posTicks / runTicks) * 100 : 0
  if (progressPct < threshold) return NextResponse.json({}, { status: 200 })

  const event: WatchedEvent = {
    id: uuidv4(),
    source: 'webhook',
    mediaServer: 'jellyfin',
    mediaType: itemType === 'Movie' ? 'movie' : 'episode',
    title: body.Item?.Name ?? 'Unknown',
    year: body.Item?.ProductionYear,
    tmdbId: body.Item?.ProviderIds?.Tmdb ? Number(body.Item.ProviderIds.Tmdb) : undefined,
    tvdbId: body.Item?.ProviderIds?.Tvdb ? Number(body.Item.ProviderIds.Tvdb) : undefined,
    seriesTitle: body.Item?.SeriesName,
    seasonNumber: body.Item?.ParentIndexNumber,
    episodeNumber: body.Item?.IndexNumber,
    progressPct: Math.min(progressPct, 100),
    watchedAt: Date.now(),
    matchStatus: 'pending',
  }

  const cache = { radarr: store.cache.radarr, sonarr: store.cache.sonarr }
  const match = matchWatchedEvent(event, cache)

  let storedEvent: WatchedEvent | null = null
  updateStore(s => {
    if (isDuplicate(event, s.watchedEvents)) return
    const stored = { ...event, ...match }
    s.watchedEvents.unshift(stored)
    if (s.watchedEvents.length > 1000) s.watchedEvents = s.watchedEvents.slice(0, 1000)
    storedEvent = stored
  })
  if (storedEvent !== null) enqueueRuleMatches(storedEvent)

  return NextResponse.json({}, { status: 200 })
}
