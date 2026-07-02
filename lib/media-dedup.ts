import type { WatchedEvent } from './types'

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

type DedupInput = Pick<WatchedEvent, 'mediaServer' | 'mediaType' | 'tmdbId' | 'tvdbId' | 'title' | 'year' | 'seasonNumber' | 'episodeNumber'>

export function dedupKey(e: DedupInput): string {
  const id = e.tmdbId != null
    ? `tmdb${e.tmdbId}`
    : e.tvdbId != null
      ? `tvdb${e.tvdbId}`
      : normalise(e.title + (e.year ?? ''))
  const ep = e.mediaType === 'episode'
    ? `_s${e.seasonNumber ?? 0}e${e.episodeNumber ?? 0}`
    : ''
  return `${e.mediaServer}_${id}${ep}`
}

const DAY_MS = 24 * 60 * 60 * 1000

export function isDuplicate(candidate: WatchedEvent, existing: WatchedEvent[]): boolean {
  const key = dedupKey(candidate)
  return existing.some(
    e => dedupKey(e) === key && Math.abs(e.watchedAt - candidate.watchedAt) < DAY_MS,
  )
}
