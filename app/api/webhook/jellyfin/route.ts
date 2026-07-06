import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { matchWatchedEvent } from '@/lib/media-matcher'
import { isDuplicate } from '@/lib/media-dedup'
import { enqueueRuleMatches } from '@/lib/deletion-executor'
import { v4 as uuidv4 } from 'uuid'
import type { WatchedEvent, NowPlayingItem } from '@/lib/types'

export const runtime = 'nodejs'

// Jellyfin webhook plugin sends a flat structure (not nested Item/Session)
interface JellyfinWebhookPayload {
  NotificationType?: string
  ItemType?: string
  Name?: string
  Year?: number
  RunTimeTicks?: number
  PlaybackPositionTicks?: number
  Id?: string           // playback session ID
  IsPaused?: boolean
  Provider_tmdb?: string
  Provider_tvdb?: string
  // Episode fields
  SeriesName?: string
  ParentIndexNumber?: number  // season number
  IndexNumber?: number        // episode number
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as JellyfinWebhookPayload | null
  if (!body) return NextResponse.json({}, { status: 200 })

  const notifType = body.NotificationType
  const itemType = body.ItemType
  if (itemType !== 'Movie' && itemType !== 'Episode') return NextResponse.json({}, { status: 200 })

  const mediaType = itemType === 'Movie' ? 'movie' : 'episode'
  const sessionId = body.Id ?? 'jellyfin-unknown'
  const runTicks = body.RunTimeTicks ?? 0
  const posTicks = body.PlaybackPositionTicks ?? 0
  const progressPct = runTicks > 0 ? Math.min((posTicks / runTicks) * 100, 100) : 0

  // Currently playing — upsert into nowPlaying
  if (notifType === 'PlaybackStart' || notifType === 'PlaybackProgress') {
    const item: NowPlayingItem = {
      sessionId,
      mediaServer: 'jellyfin',
      mediaType,
      title: body.Name ?? 'Unknown',
      year: body.Year,
      seriesTitle: body.SeriesName,
      seasonNumber: body.ParentIndexNumber,
      episodeNumber: body.IndexNumber,
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
    title: body.Name ?? 'Unknown',
    year: body.Year,
    tmdbId: body.Provider_tmdb ? Number(body.Provider_tmdb) : undefined,
    tvdbId: body.Provider_tvdb ? Number(body.Provider_tvdb) : undefined,
    seriesTitle: body.SeriesName,
    seasonNumber: body.ParentIndexNumber,
    episodeNumber: body.IndexNumber,
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
