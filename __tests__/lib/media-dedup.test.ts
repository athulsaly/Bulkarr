// @jest-environment node
import { dedupKey, isDuplicate } from '@/lib/media-dedup'
import type { WatchedEvent } from '@/lib/types'

const NOW = Date.now()

const BASE: WatchedEvent = {
  id: 'test-id',
  source: 'poll',
  mediaServer: 'jellyfin',
  mediaType: 'movie',
  title: 'Inception',
  year: 2010,
  tmdbId: 27205,
  progressPct: 95,
  watchedAt: NOW,
  matchStatus: 'pending',
}

test('dedupKey uses tmdbId when present', () => {
  expect(dedupKey(BASE)).toBe('jellyfin_tmdb27205')
})

test('dedupKey uses tvdbId when no tmdbId', () => {
  const e = { ...BASE, tmdbId: undefined, tvdbId: 81189 }
  expect(dedupKey(e)).toBe('jellyfin_tvdb81189')
})

test('dedupKey falls back to normalised title+year', () => {
  const e = { ...BASE, tmdbId: undefined }
  expect(dedupKey(e)).toBe('jellyfin_inception2010')
})

test('dedupKey appends season+episode for episodes', () => {
  const e = { ...BASE, mediaType: 'episode' as const, tmdbId: undefined, tvdbId: 81189, seasonNumber: 2, episodeNumber: 5 }
  expect(dedupKey(e)).toBe('jellyfin_tvdb81189_s2e5')
})

test('isDuplicate returns true for same event within 24h', () => {
  const existing = [{ ...BASE, id: 'existing' }]
  const candidate = { ...BASE, id: 'new', source: 'webhook' as const }
  expect(isDuplicate(candidate, existing)).toBe(true)
})

test('isDuplicate returns false when outside 24h window', () => {
  const old = { ...BASE, id: 'old', watchedAt: NOW - 25 * 60 * 60 * 1000 }
  expect(isDuplicate({ ...BASE, id: 'new' }, [old])).toBe(false)
})

test('isDuplicate returns false for different media server', () => {
  const existing = [{ ...BASE, id: 'existing' }]
  const candidate = { ...BASE, id: 'new', mediaServer: 'plex' as const }
  expect(isDuplicate(candidate, existing)).toBe(false)
})

test('isDuplicate returns false for empty list', () => {
  expect(isDuplicate(BASE, [])).toBe(false)
})
