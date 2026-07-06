import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { matchWatchedEvent } from '@/lib/media-matcher'
import { isDuplicate } from '@/lib/media-dedup'
import { enqueueRuleMatches } from '@/lib/deletion-executor'
import { v4 as uuidv4 } from 'uuid'
import type { WatchedEvent, NowPlayingItem } from '@/lib/types'
import { appendWebhookLog } from '@/lib/webhook-log'

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
  Session?: {
    Id?: string
    PlayState?: { PositionTicks?: number }
  }
}

export async function POST(req: NextRequest) {
  let body: JellyfinWebhookPayload | null = null
  let rawText = ''
  try {
    rawText = await req.text()
    body = JSON.parse(rawText) as JellyfinWebhookPayload
  } catch { /* body stays null */ }
  appendWebhookLog({ ts: Date.now(), source: 'jellyfin', body: body ?? rawText ?? null })
  if (!body) return NextResponse.json({}, { status: 200 })

  const notifType = body.NotificationType
  const itemType = body.Item?.Type
  if (itemType !== 'Movie' && itemType !== 'Episode') return NextResponse.json({}, { status: 200 })

  const mediaType = itemType === 'Movie' ? 'movie' : 'episode'
  const sessionId = body.Session?.Id ?? 'jellyfin-unknown'
  const runTicks = body.Item?.RunTimeTicks ?? 0
  const posTicks = body.Session?.PlayState?.PositionTicks ?? 0
  const progressPct = runTicks > 0 ? Math.min((posTicks / runTicks) * 100, 100) : 0

  // Currently playing — upsert into nowPlaying
  if (notifType === 'PlaybackStart' || notifType === 'PlaybackProgress') {
    const item: NowPlayingItem = {
      sessionId,
      mediaServer: 'jellyfin',
      mediaType,
      title: body.Item?.Name ?? 'Unknown',
      year: body.Item?.ProductionYear,
      seriesTitle: body.Item?.SeriesName,
      seasonNumber: body.Item?.ParentIndexNumber,
      episodeNumber: body.Item?.IndexNumber,
      progressPct,
      updatedAt: Date.now(),
    }
    updateStore(s => {
      const idx = s.nowPlaying.findIndex(i => i.sessionId === sessionId)
      if (idx === -1) s.nowPlaying.push(item)
      else s.nowPlaying[idx] = item
    })
    return NextResponse.json({}, { status: 200 })
  }

  if (notifType !== 'PlaybackStop') return NextResponse.json({}, { status: 200 })

  // Remove from nowPlaying on stop
  updateStore(s => {
    s.nowPlaying = s.nowPlaying.filter(i => i.sessionId !== sessionId)
  })

  const store = readStore()
  const threshold = store.settings.mediaServer.watchedThresholdPct
  if (progressPct < threshold) return NextResponse.json({}, { status: 200 })

  const event: WatchedEvent = {
    id: uuidv4(),
    source: 'webhook',
    mediaServer: 'jellyfin',
    mediaType,
    title: body.Item?.Name ?? 'Unknown',
    year: body.Item?.ProductionYear,
    tmdbId: body.Item?.ProviderIds?.Tmdb ? Number(body.Item.ProviderIds.Tmdb) : undefined,
    tvdbId: body.Item?.ProviderIds?.Tvdb ? Number(body.Item.ProviderIds.Tvdb) : undefined,
    seriesTitle: body.Item?.SeriesName,
    seasonNumber: body.Item?.ParentIndexNumber,
    episodeNumber: body.Item?.IndexNumber,
    progressPct,
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
