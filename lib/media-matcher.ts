import type { WatchedEvent, Cache } from './types'

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

type EventInput = Pick<WatchedEvent, 'tmdbId' | 'tvdbId' | 'title' | 'year' | 'mediaType'>
type MatchResult = Pick<WatchedEvent, 'arrId' | 'arrTarget' | 'matchStatus'>

export function matchWatchedEvent(event: EventInput, cache: Cache): MatchResult {
  const radarrLib = cache.radarr?.library ?? []
  const sonarrLib = cache.sonarr?.library ?? []

  // 1. tmdbId → Radarr (movies)
  if (event.tmdbId != null) {
    const hit = radarrLib.find(i => i.tmdbId === event.tmdbId)
    if (hit) return { arrId: hit.id, arrTarget: 'movies', matchStatus: 'matched' }
  }

  // 2. tvdbId → Sonarr (series)
  if (event.tvdbId != null) {
    const hit = sonarrLib.find(i => i.tvdbId === event.tvdbId)
    if (hit) return { arrId: hit.id, arrTarget: 'series', matchStatus: 'matched' }
  }

  // 3. tmdbId → Sonarr (animated series sometimes use TMDb)
  if (event.tmdbId != null) {
    const hit = sonarrLib.find(i => i.tmdbId === event.tmdbId)
    if (hit) return { arrId: hit.id, arrTarget: 'series', matchStatus: 'matched' }
  }

  // 4. Title+year fallback (both libraries)
  const normQuery = normalise(event.title + (event.year != null ? ` ${event.year}` : ''))
  const radarrHit = radarrLib.find(i => normalise(i.title + (i.tmdbId != null ? '' : '')) === normQuery ||
    normalise(`${i.title} `) === normalise(event.title + ' '))
  if (radarrHit) return { arrId: radarrHit.id, arrTarget: 'movies', matchStatus: 'matched' }
  const sonarrHit = sonarrLib.find(i => normalise(`${i.title} `) === normalise(event.title + ' '))
  if (sonarrHit) return { arrId: sonarrHit.id, arrTarget: 'series', matchStatus: 'matched' }

  // 5. No cache at all → pending (can re-match later)
  if (!cache.radarr && !cache.sonarr) return { matchStatus: 'pending' }

  return { matchStatus: 'unmatched' }
}
