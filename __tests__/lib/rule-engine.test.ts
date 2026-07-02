// @jest-environment node

import { delayToMs, evaluateRules } from '@/lib/rule-engine'
import type { AutoDeleteRule, DeletionQueueItem, WatchedEvent } from '@/lib/types'

const baseMovieEvent: WatchedEvent = {
  id: 'ev1',
  source: 'poll',
  mediaServer: 'jellyfin',
  mediaType: 'movie',
  title: 'Inception',
  year: 2010,
  tmdbId: 27205,
  progressPct: 95,
  watchedAt: 1_000_000,
  arrId: 10,
  arrTarget: 'movies',
  matchStatus: 'matched',
}

const baseEpisodeEvent: WatchedEvent = {
  id: 'ev2',
  source: 'poll',
  mediaServer: 'plex',
  mediaType: 'episode',
  title: 'Pilot',
  seriesTitle: 'Breaking Bad',
  seasonNumber: 1,
  episodeNumber: 1,
  progressPct: 98,
  watchedAt: 2_000_000,
  arrId: 20,
  arrTarget: 'series',
  matchStatus: 'matched',
}

const movieRule: AutoDeleteRule = {
  id: 'r1',
  name: 'Delete watched movies',
  enabled: true,
  mediaType: 'movie',
  granularity: 'movie',
  action: 'delete',
  deleteFiles: true,
  delayAmount: 7,
  delayUnit: 'days',
  scope: 'global',
}

const episodeRule: AutoDeleteRule = {
  id: 'r2',
  name: 'Delete watched episodes',
  enabled: true,
  mediaType: 'series',
  granularity: 'episode',
  action: 'delete',
  deleteFiles: true,
  delayAmount: 1,
  delayUnit: 'days',
  scope: 'global',
}

const seasonRule: AutoDeleteRule = {
  id: 'r3',
  name: 'Unmonitor completed seasons',
  enabled: true,
  mediaType: 'series',
  granularity: 'season',
  action: 'unmonitor',
  deleteFiles: false,
  delayAmount: 2,
  delayUnit: 'days',
  scope: 'global',
}

// --- delayToMs ---

test('delayToMs: days', () => {
  expect(delayToMs(3, 'days')).toBe(3 * 86_400_000)
})

test('delayToMs: weeks', () => {
  expect(delayToMs(2, 'weeks')).toBe(2 * 7 * 86_400_000)
})

test('delayToMs: months', () => {
  expect(delayToMs(1, 'months')).toBe(30 * 86_400_000)
})

test('delayToMs: year ignores amount', () => {
  expect(delayToMs(5, 'year')).toBe(365 * 86_400_000)
})

// --- evaluateRules: basic matching ---

test('movie event matches movie rule', () => {
  const items = evaluateRules(baseMovieEvent, [movieRule], [], [baseMovieEvent])
  expect(items).toHaveLength(1)
  expect(items[0].ruleId).toBe('r1')
  expect(items[0].arrId).toBe(10)
  expect(items[0].granularity).toBe('movie')
  expect(items[0].action).toBe('delete')
  expect(items[0].deleteFiles).toBe(true)
  expect(items[0].scheduledAt).toBe(1_000_000 + 7 * 86_400_000)
  expect(items[0].status).toBe('pending')
  expect(items[0].retryCount).toBe(0)
})

test('episode event matches episode rule', () => {
  const items = evaluateRules(baseEpisodeEvent, [episodeRule], [], [baseEpisodeEvent])
  expect(items).toHaveLength(1)
  expect(items[0].ruleId).toBe('r2')
  expect(items[0].arrId).toBe(20)
  expect(items[0].seasonNumber).toBe(1)
  expect(items[0].episodeNumber).toBe(1)
  expect(items[0].title).toBe('Pilot')
  expect(items[0].seriesTitle).toBe('Breaking Bad')
})

test('movie event does not match series rule', () => {
  const items = evaluateRules(baseMovieEvent, [episodeRule], [], [baseMovieEvent])
  expect(items).toHaveLength(0)
})

test('episode event does not match movie rule', () => {
  const items = evaluateRules(baseEpisodeEvent, [movieRule], [], [baseEpisodeEvent])
  expect(items).toHaveLength(0)
})

test('disabled rule is skipped', () => {
  const disabled = { ...movieRule, enabled: false }
  const items = evaluateRules(baseMovieEvent, [disabled], [], [baseMovieEvent])
  expect(items).toHaveLength(0)
})

// --- deduplication ---

test('skips if non-cancelled queue item exists for same ruleId+arrId+episodeNumber', () => {
  const existing: DeletionQueueItem = {
    id: 'q1', ruleId: 'r2', ruleName: 'n', watchedEventId: 'ev2',
    arrId: 20, arrTarget: 'series', action: 'delete', deleteFiles: true,
    granularity: 'episode', title: 'Pilot', seasonNumber: 1, episodeNumber: 1,
    scheduledAt: 999, status: 'pending', retryCount: 0,
  }
  const items = evaluateRules(baseEpisodeEvent, [episodeRule], [existing], [baseEpisodeEvent])
  expect(items).toHaveLength(0)
})

test('does not skip if existing queue item is cancelled', () => {
  const cancelled: DeletionQueueItem = {
    id: 'q1', ruleId: 'r2', ruleName: 'n', watchedEventId: 'ev2',
    arrId: 20, arrTarget: 'series', action: 'delete', deleteFiles: true,
    granularity: 'episode', title: 'Pilot', seasonNumber: 1, episodeNumber: 1,
    scheduledAt: 999, status: 'cancelled', retryCount: 0,
  }
  const items = evaluateRules(baseEpisodeEvent, [episodeRule], [cancelled], [baseEpisodeEvent])
  expect(items).toHaveLength(1)
})

// --- specific scope priority ---

test('specific scope rule takes priority over global for same granularity', () => {
  const specificRule: AutoDeleteRule = {
    ...movieRule,
    id: 'r-specific',
    scope: 'specific',
    arrId: 10,
    arrTarget: 'movies',
    delayAmount: 1,
  }
  const items = evaluateRules(baseMovieEvent, [movieRule, specificRule], [], [baseMovieEvent])
  // Only specific rule fires for this arrId
  expect(items).toHaveLength(1)
  expect(items[0].ruleId).toBe('r-specific')
})

test('global rule fires when no specific rule matches this arrId', () => {
  const specificForOther: AutoDeleteRule = {
    ...movieRule,
    id: 'r-other',
    scope: 'specific',
    arrId: 99,
    arrTarget: 'movies',
  }
  const items = evaluateRules(baseMovieEvent, [movieRule, specificForOther], [], [baseMovieEvent])
  expect(items).toHaveLength(1)
  expect(items[0].ruleId).toBe('r1')
})

// --- season granularity ---

test('season rule uses max watchedAt across season episodes for scheduledAt', () => {
  const ep2Event: WatchedEvent = {
    ...baseEpisodeEvent,
    id: 'ev3',
    episodeNumber: 2,
    watchedAt: 3_000_000,
  }
  const allEvents = [baseEpisodeEvent, ep2Event]
  const items = evaluateRules(ep2Event, [seasonRule], [], allEvents)
  expect(items).toHaveLength(1)
  expect(items[0].granularity).toBe('season')
  expect(items[0].seasonNumber).toBe(1)
  expect(items[0].episodeNumber).toBeUndefined()
  // scheduledAt = max(2_000_000, 3_000_000) + 2 days
  expect(items[0].scheduledAt).toBe(3_000_000 + 2 * 86_400_000)
})

test('season rule dedup: skips if non-cancelled item exists for ruleId+arrId+seasonNumber', () => {
  const existing: DeletionQueueItem = {
    id: 'q1', ruleId: 'r3', ruleName: 'n', watchedEventId: 'ev2',
    arrId: 20, arrTarget: 'series', action: 'unmonitor', deleteFiles: false,
    granularity: 'season', title: 'Breaking Bad', seasonNumber: 1,
    scheduledAt: 999, status: 'pending', retryCount: 0,
  }
  const items = evaluateRules(baseEpisodeEvent, [seasonRule], [existing], [baseEpisodeEvent])
  expect(items).toHaveLength(0)
})

test('episode rule and season rule can both fire for same episode event', () => {
  const items = evaluateRules(baseEpisodeEvent, [episodeRule, seasonRule], [], [baseEpisodeEvent])
  const granularities = items.map(i => i.granularity)
  expect(granularities).toContain('episode')
  expect(granularities).toContain('season')
})
