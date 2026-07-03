// @jest-environment node

import { runExecutorCycle, enqueueRuleMatches } from '@/lib/deletion-executor'
import type { DeletionQueueItem, WatchedEvent, AutoDeleteRule } from '@/lib/types'

// Mock store
const mockStore = {
  rules: [] as AutoDeleteRule[],
  deletionQueue: [] as DeletionQueueItem[],
  watchedEvents: [] as WatchedEvent[],
  settings: {
    radarr: { url: 'http://radarr:7878', apiKey: 'rkey' },
    sonarr: { url: 'http://sonarr:8989', apiKey: 'skey' },
  },
}

jest.mock('@/lib/store', () => ({
  readStore: () => JSON.parse(JSON.stringify(mockStore)),
  updateStore: (fn: (s: typeof mockStore) => void) => { fn(mockStore); return mockStore },
}))

jest.mock('@/lib/arr-client', () => ({
  deleteMovie: jest.fn().mockResolvedValue(undefined),
  unmonitorMovie: jest.fn().mockResolvedValue(undefined),
  deleteEpisodeFile: jest.fn().mockResolvedValue(undefined),
  deleteSeasonFiles: jest.fn().mockResolvedValue(undefined),
  unmonitorEpisode: jest.fn().mockResolvedValue(undefined),
  unmonitorSeason: jest.fn().mockResolvedValue(undefined),
  getSeasonEpisodeFileCount: jest.fn().mockResolvedValue(0),
}))

import { deleteMovie, unmonitorMovie, deleteEpisodeFile, unmonitorSeason } from '@/lib/arr-client'

const pendingMovieItem: DeletionQueueItem = {
  id: 'q1', ruleId: 'r1', ruleName: 'Test', watchedEventId: 'e1',
  arrId: 10, arrTarget: 'movies', action: 'delete', deleteFiles: true,
  granularity: 'movie', title: 'Inception',
  scheduledAt: Date.now() - 1000, // overdue
  status: 'pending', retryCount: 0,
}

beforeEach(() => {
  mockStore.rules = []
  mockStore.deletionQueue = []
  mockStore.watchedEvents = []
  jest.clearAllMocks()
})

// --- runExecutorCycle ---

test('executes overdue pending movie item and marks done', async () => {
  mockStore.deletionQueue = [{ ...pendingMovieItem }]
  const result = await runExecutorCycle()
  expect(deleteMovie).toHaveBeenCalledWith('http://radarr:7878', 'rkey', 10, true)
  expect(result.executed).toBe(1)
  expect(result.failed).toBe(0)
  expect(mockStore.deletionQueue[0].status).toBe('done')
  expect(mockStore.deletionQueue[0].executedAt).toBeDefined()
})

test('skips items not yet due', async () => {
  mockStore.deletionQueue = [{ ...pendingMovieItem, scheduledAt: Date.now() + 60_000 }]
  const result = await runExecutorCycle()
  expect(deleteMovie).not.toHaveBeenCalled()
  expect(result.executed).toBe(0)
})

test('increments retryCount on failure, stays pending if < 3', async () => {
  ;(deleteMovie as jest.Mock).mockRejectedValueOnce(new Error('network timeout'))
  mockStore.deletionQueue = [{ ...pendingMovieItem }]
  const result = await runExecutorCycle()
  expect(result.failed).toBe(1)
  expect(mockStore.deletionQueue[0].status).toBe('pending')
  expect(mockStore.deletionQueue[0].retryCount).toBe(1)
})

test('marks failed after 3 retries', async () => {
  ;(deleteMovie as jest.Mock).mockRejectedValue(new Error('persistent error'))
  mockStore.deletionQueue = [{ ...pendingMovieItem, retryCount: 2 }]
  await runExecutorCycle()
  expect(mockStore.deletionQueue[0].status).toBe('failed')
  expect(mockStore.deletionQueue[0].errorMessage).toBe('persistent error')
})

test('one failure does not block other items', async () => {
  ;(deleteMovie as jest.Mock)
    .mockRejectedValueOnce(new Error('first fails'))
    .mockResolvedValueOnce(undefined)
  mockStore.deletionQueue = [
    { ...pendingMovieItem, id: 'q1' },
    { ...pendingMovieItem, id: 'q2', arrId: 11 },
  ]
  const result = await runExecutorCycle()
  expect(result.executed).toBe(1)
  expect(result.failed).toBe(1)
})

test('unmonitor movie calls unmonitorMovie not deleteMovie', async () => {
  mockStore.deletionQueue = [{ ...pendingMovieItem, action: 'unmonitor', deleteFiles: false }]
  await runExecutorCycle()
  expect(unmonitorMovie).toHaveBeenCalled()
  expect(deleteMovie).not.toHaveBeenCalled()
})

test('season item reschedules when not all episodes watched', async () => {
  ;(require('@/lib/arr-client').getSeasonEpisodeFileCount as jest.Mock).mockResolvedValue(5)
  mockStore.watchedEvents = [
    { id: 'e1', arrId: 20, seasonNumber: 1, episodeNumber: 1, matchStatus: 'matched' } as WatchedEvent,
  ]
  const seasonItem: DeletionQueueItem = {
    ...pendingMovieItem, id: 'q-season', arrId: 20, arrTarget: 'series',
    granularity: 'season', action: 'unmonitor', seasonNumber: 1,
  }
  mockStore.deletionQueue = [seasonItem]
  const scheduledBefore = mockStore.deletionQueue[0].scheduledAt
  await runExecutorCycle()
  expect(unmonitorSeason).not.toHaveBeenCalled()
  expect(mockStore.deletionQueue[0].scheduledAt).toBeGreaterThan(scheduledBefore)
})

test('season item executes when all episodes watched', async () => {
  ;(require('@/lib/arr-client').getSeasonEpisodeFileCount as jest.Mock).mockResolvedValue(1)
  mockStore.settings.sonarr = { url: 'http://sonarr:8989', apiKey: 'skey' }
  mockStore.watchedEvents = [
    { id: 'e1', arrId: 20, seasonNumber: 1, episodeNumber: 1, matchStatus: 'matched' } as WatchedEvent,
  ]
  const seasonItem: DeletionQueueItem = {
    ...pendingMovieItem, id: 'q-season', arrId: 20, arrTarget: 'series',
    granularity: 'season', action: 'unmonitor', seasonNumber: 1,
  }
  mockStore.deletionQueue = [seasonItem]
  await runExecutorCycle()
  expect(unmonitorSeason).toHaveBeenCalled()
})

// --- enqueueRuleMatches ---

test('enqueueRuleMatches skips unmatched events', () => {
  const event = { id: 'e1', arrId: 10, matchStatus: 'unmatched' } as WatchedEvent
  const before = mockStore.deletionQueue.length
  enqueueRuleMatches(event)
  expect(mockStore.deletionQueue.length).toBe(before)
})

test('enqueueRuleMatches adds item when rule matches', () => {
  const rule: AutoDeleteRule = {
    id: 'r1', name: 'Test', enabled: true, mediaType: 'movie', granularity: 'movie',
    action: 'delete', deleteFiles: true, delayAmount: 7, delayUnit: 'days', targets: [{ arrId: 10, arrTarget: 'movies' as const }],
  }
  mockStore.rules = [rule]
  const event: WatchedEvent = {
    id: 'e1', source: 'poll', mediaServer: 'jellyfin', mediaType: 'movie',
    title: 'Inception', progressPct: 95, watchedAt: Date.now(),
    arrId: 10, arrTarget: 'movies', matchStatus: 'matched',
  }
  mockStore.watchedEvents = [event]
  enqueueRuleMatches(event)
  expect(mockStore.deletionQueue).toHaveLength(1)
  expect(mockStore.deletionQueue[0].ruleId).toBe('r1')
})
