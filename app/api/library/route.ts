export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { getMovieLibraryFull, getSeriesLibraryFull, ArrApiError } from '@/lib/arr-client'
import type { LibraryItemFull } from '@/lib/types'

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('target') as 'movies' | 'series' | null
  if (target !== 'movies' && target !== 'series') {
    return NextResponse.json({ error: 'target required (movies|series)' }, { status: 400 })
  }

  const store = readStore()
  const service = target === 'movies' ? 'radarr' : 'sonarr'
  const config = store.settings[service]
  if (!config) {
    return NextResponse.json({ error: `${service} not configured` }, { status: 400 })
  }

  const profiles = (target === 'movies' ? store.cache.radarr?.profiles : store.cache.sonarr?.profiles) ?? []
  const cachedPosters = target === 'movies' ? store.posterCache.movies : store.posterCache.series
  const mediaType = target === 'movies' ? 'movie' : 'series'

  try {
    const raw = target === 'movies'
      ? await getMovieLibraryFull(config.url, config.apiKey)
      : await getSeriesLibraryFull(config.url, config.apiKey)

    // Collect new poster URLs to persist
    const posterUpdates: Record<number, string> = {}
    for (const item of raw) {
      if (item.posterUrl) posterUpdates[item.id] = item.posterUrl
    }

    // Save to poster cache (only if there are updates)
    if (Object.keys(posterUpdates).length > 0) {
      updateStore(s => {
        const bucket = target === 'movies' ? s.posterCache.movies : s.posterCache.series
        Object.assign(bucket, posterUpdates)
      })
    }

    const items: LibraryItemFull[] = raw.map(item => ({
      ...item,
      posterUrl: item.posterUrl ?? cachedPosters[item.id],
      qualityProfileName: profiles.find(p => p.id === item.qualityProfileId)?.name,
      assignedRules: store.rules.filter(r =>
        (r.scope === 'global' && r.mediaType === mediaType) ||
        (r.scope === 'specific' && r.arrId === item.id && r.arrTarget === target)
      ),
    }))

    return NextResponse.json({ items })
  } catch (e) {
    if (e instanceof ArrApiError) return NextResponse.json({ error: e.message }, { status: 502 })
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
