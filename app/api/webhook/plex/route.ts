import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { matchWatchedEvent } from '@/lib/media-matcher'
import { isDuplicate } from '@/lib/media-dedup'
import { enqueueRuleMatches } from '@/lib/deletion-executor'
import { v4 as uuidv4 } from 'uuid'
import type { WatchedEvent, NowPlayingItem } from '@/lib/types'
import { appendWebhookLog } from '@/lib/webhook-log'

export const runtime = 'nodejs'

interface PlexGuid { id: string }

interface PlexWebhookPayload {
  event?: string
  Metadata?: {
    type?: string
    title?: string
    year?: number
    grandparentTitle?: string
    parentIndex?: number
    index?: number
    Guid?: PlexGuid[]
    viewOffset?: number
    duration?: number
  }
  Player?: {
    uuid?: string
  }
}

function extractId(guids: PlexGuid[], scheme: string): number | undefined {
  const hit = guids.find(g => g.id.startsWith(`${scheme}://`))
  return hit ? Number(hit.id.slice(scheme.length + 3)) : undefined
}

const NOW_PLAYING_EVENTS = new Set(['media.play', 'media.pause', 'media.resume'])
const STOP_EVENTS = new Set(['media.stop', 'media.scrobble'])

export async function POST(req: NextRequest) {
  let body: PlexWebhookPayload | null = null
  try {
    const form = await req.formData()
    const raw = form.get('payload')
    if (typeof raw === 'string') body = JSON.parse(raw) as PlexWebhookPayload
  } catch {
    return NextResponse.json({}, { status: 200 })
  }

  appendWebhookLog({ ts: Date.now(), source: 'plex', body })
  if (!body?.event || !body.Metadata) return NextResponse.json({}, { status: 200 })
  const { event, Metadata, Player } = body

  const mediaType = Metadata.type === 'movie' ? 'movie' : Metadata.type === 'episode' ? 'episode' : null
  if (!mediaType) return NextResponse.json({}, { status: 200 })

  const sessionId = Player?.uuid ?? 'plex-unknown'
  const progressPct = Metadata.viewOffset != null && Metadata.duration && Metadata.duration > 0
    ? Math.min((Metadata.viewOffset / Metadata.duration) * 100, 100)
    : event === 'media.scrobble' ? 100 : 0

  // Currently playing — upsert into nowPlaying
  if (NOW_PLAYING_EVENTS.has(event)) {
    const item: NowPlayingItem = {
      sessionId,
      mediaServer: 'plex',
      mediaType,
      title: Metadata.title ?? 'Unknown',
      year: Metadata.year,
      seriesTitle: Metadata.grandparentTitle,
      seasonNumber: Metadata.parentIndex,
      episodeNumber: Metadata.index,
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

  if (!STOP_EVENTS.has(event)) return NextResponse.json({}, { status: 200 })

  // Remove from nowPlaying on stop/scrobble
  updateStore(s => {
    s.nowPlaying = s.nowPlaying.filter(i => i.sessionId !== sessionId)
  })

  const store = readStore()
  const threshold = store.settings.mediaServer.watchedThresholdPct
  const finalProgress = event === 'media.scrobble' ? 100 : progressPct
  if (finalProgress < threshold) return NextResponse.json({}, { status: 200 })

  const guids = Metadata.Guid ?? []
  const watchedEvent: WatchedEvent = {
    id: uuidv4(),
    source: 'webhook',
    mediaServer: 'plex',
    mediaType,
    title: Metadata.title ?? 'Unknown',
    year: Metadata.year,
    tmdbId: extractId(guids, 'tmdb'),
    tvdbId: extractId(guids, 'tvdb'),
    seriesTitle: Metadata.grandparentTitle,
    seasonNumber: Metadata.parentIndex,
    episodeNumber: Metadata.index,
    progressPct: finalProgress,
    watchedAt: Date.now(),
    matchStatus: 'pending',
  }

  const cache = { radarr: store.cache.radarr, sonarr: store.cache.sonarr }
  const match = matchWatchedEvent(watchedEvent, cache)

  let storedEvent: WatchedEvent | null = null
  updateStore(s => {
    if (isDuplicate(watchedEvent, s.watchedEvents)) return
    const stored = { ...watchedEvent, ...match }
    s.watchedEvents.unshift(stored)
    if (s.watchedEvents.length > 1000) s.watchedEvents = s.watchedEvents.slice(0, 1000)
    storedEvent = stored
  })
  if (storedEvent !== null) enqueueRuleMatches(storedEvent)

  return NextResponse.json({}, { status: 200 })
}
