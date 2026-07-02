// @jest-environment node
import { matchWatchedEvent } from '@/lib/media-matcher'
import type { Cache, WatchedEvent } from '@/lib/types'

const EMPTY_CACHE: Cache = { radarr: null, sonarr: null }

const BASE_SVC = { profiles: [], rootFolders: [], langProfiles: [], fetchedAt: Date.now() }

const RADARR_CACHE: Cache = {
  radarr: { ...BASE_SVC, library: [{ id: 42, title: 'Inception', tmdbId: 27205 }] },
  sonarr: null,
}

const SONARR_CACHE: Cache = {
  radarr: null,
  sonarr: { ...BASE_SVC, library: [{ id: 7, title: 'Breaking Bad', tvdbId: 81189 }] },
}

const BOTH_CACHE: Cache = {
  radarr: { ...BASE_SVC, library: [{ id: 42, title: 'Inception', tmdbId: 27205 }] },
  sonarr: { ...BASE_SVC, library: [{ id: 7, title: 'Breaking Bad', tvdbId: 81189 }] },
}

type MatchInput = Pick<WatchedEvent, 'tmdbId' | 'tvdbId' | 'title' | 'year' | 'mediaType'>

const MOVIE: MatchInput = { mediaType: 'movie', title: 'Inception', year: 2010, tmdbId: 27205 }
const SERIES: MatchInput = { mediaType: 'episode', title: 'Breaking Bad', year: 2008, tvdbId: 81189 }

test('matches movie by tmdbId against Radarr', () => {
  expect(matchWatchedEvent(MOVIE, RADARR_CACHE)).toMatchObject({ arrId: 42, arrTarget: 'movies', matchStatus: 'matched' })
})

test('matches series by tvdbId against Sonarr', () => {
  expect(matchWatchedEvent(SERIES, SONARR_CACHE)).toMatchObject({ arrId: 7, arrTarget: 'series', matchStatus: 'matched' })
})

test('falls back to title+year when no IDs match', () => {
  const event: MatchInput = { mediaType: 'movie', title: 'Inception', year: 2010 }
  expect(matchWatchedEvent(event, RADARR_CACHE)).toMatchObject({ arrId: 42, arrTarget: 'movies', matchStatus: 'matched' })
})

test('returns pending when both caches are null', () => {
  expect(matchWatchedEvent(MOVIE, EMPTY_CACHE).matchStatus).toBe('pending')
})

test('returns unmatched when cache is present but no match found', () => {
  const event: MatchInput = { mediaType: 'movie', title: 'Unknown Movie', year: 2025, tmdbId: 99999 }
  expect(matchWatchedEvent(event, RADARR_CACHE).matchStatus).toBe('unmatched')
})

test('title match is case-insensitive and punctuation-insensitive', () => {
  const event: MatchInput = { mediaType: 'movie', title: 'INCEPTION!', year: 2010 }
  expect(matchWatchedEvent(event, RADARR_CACHE)).toMatchObject({ matchStatus: 'matched' })
})

test('matches tmdbId against Sonarr (animated series)', () => {
  const sonarrWithTmdb: Cache = {
    radarr: null,
    sonarr: { ...BASE_SVC, library: [{ id: 5, title: 'Arcane', tmdbId: 94605 }] },
  }
  const event: MatchInput = { mediaType: 'episode', title: 'Arcane', tmdbId: 94605 }
  expect(matchWatchedEvent(event, sonarrWithTmdb)).toMatchObject({ arrId: 5, arrTarget: 'series', matchStatus: 'matched' })
})
