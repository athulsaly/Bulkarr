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
  const normTitle = normalise(event.title)
  const radarrHit = radarrLib.find(i => {
    const iNormTitle = normalise(i.title)
    if (iNormTitle !== normTitle) return false
    if (event.year != null && i.year != null) return i.year === event.year
    return true  // year unknown on one side — accept title match
  })
  if (radarrHit) return { arrId: radarrHit.id, arrTarget: 'movies', matchStatus: 'matched' }
  const sonarrHit = sonarrLib.find(i => {
    const iNormTitle = normalise(i.title)
    if (iNormTitle !== normTitle) return false
    if (event.year != null && i.year != null) return i.year === event.year
    return true  // year unknown on one side — accept title match
  })
  if (sonarrHit) return { arrId: sonarrHit.id, arrTarget: 'series', matchStatus: 'matched' }

  // 5. No cache at all → pending (can re-match later)
  if (!cache.radarr && !cache.sonarr) return { matchStatus: 'pending' }

  return { matchStatus: 'unmatched' }
}
