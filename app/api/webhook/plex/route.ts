import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { matchWatchedEvent } from '@/lib/media-matcher'
import { isDuplicate } from '@/lib/media-dedup'
import { enqueueRuleMatches } from '@/lib/deletion-executor'
import { v4 as uuidv4 } from 'uuid'
import type { WatchedEvent } from '@/lib/types'

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
}

function extractId(guids: PlexGuid[], scheme: string): number | undefined {
  const hit = guids.find(g => g.id.startsWith(`${scheme}://`))
  return hit ? Number(hit.id.slice(scheme.length + 3)) : undefined
}

export async function POST(req: NextRequest) {
  let body: PlexWebhookPayload | null = null
  try {
    const form = await req.formData()
    const raw = form.get('payload')
    if (typeof raw === 'string') body = JSON.parse(raw) as PlexWebhookPayload
  } catch {
    return NextResponse.json({}, { status: 200 })
  }

  if (!body?.event || !body.Metadata) return NextResponse.json({}, { status: 200 })
  const { event, Metadata } = body
  if (event !== 'media.scrobble' && event !== 'media.stop') return NextResponse.json({}, { status: 200 })

  const mediaType = Metadata.type === 'movie' ? 'movie' : Metadata.type === 'episode' ? 'episode' : null
  if (!mediaType) return NextResponse.json({}, { status: 200 })

  const store = readStore()
  const threshold = store.settings.mediaServer.watchedThresholdPct
  const progressPct = event === 'media.scrobble'
    ? 100
    : Metadata.viewOffset != null && Metadata.duration && Metadata.duration > 0
      ? (Metadata.viewOffset / Metadata.duration) * 100
      : 0
  if (progressPct < threshold) return NextResponse.json({}, { status: 200 })

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
    progressPct: Math.min(progressPct, 100),
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
