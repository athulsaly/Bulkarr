// @jest-environment node

import { GET } from '@/app/api/dashboard/route'
import { NextRequest } from 'next/server'
import type { WatchedEvent } from '@/lib/types'

const mockStore = {
  cache: {
    radarr: { library: [{ id: 1 }, { id: 2 }] },
    sonarr: { library: [{ id: 3 }] },
  },
  rules: [{ id: 'r1', enabled: true }, { id: 'r2', enabled: false }],
  deletionQueue: [{ id: 'q1', status: 'pending' }, { id: 'q2', status: 'done' }],
  history: [
    { id: 'h1', title: 'A', target: 'movies', addedAt: 3000 },
    { id: 'h2', title: 'B', target: 'movies', addedAt: 2000 },
    { id: 'h3', title: 'C', target: 'movies', addedAt: 1000 },
  ],
  watchedEvents: [
    { id: 'w1', matchStatus: 'matched', watchedAt: 3000, mediaType: 'movie', title: 'Film A', progressPct: 95, source: 'webhook', mediaServer: 'jellyfin' },
    { id: 'w2', matchStatus: 'unmatched', watchedAt: 2000, mediaType: 'movie', title: 'Film B', progressPct: 95, source: 'webhook', mediaServer: 'jellyfin' },
    { id: 'w3', matchStatus: 'matched', watchedAt: 1000, mediaType: 'episode', title: 'Show C Ep 1', progressPct: 95, source: 'poll', mediaServer: 'plex' },
  ] as WatchedEvent[],
}

jest.mock('@/lib/store', () => ({
  readStore: () => JSON.parse(JSON.stringify(mockStore)),
}))

test('returns correct counts', async () => {
  const req = new NextRequest('http://localhost/api/dashboard')
  const res = await GET(req)
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.movies).toBe(2)
  expect(body.series).toBe(1)
  expect(body.activeRules).toBe(1)
  expect(body.pendingQueue).toBe(1)
})

test('returns history sorted newest-first, max 5', async () => {
  const req = new NextRequest('http://localhost/api/dashboard')
  const res = await GET(req)
  const body = await res.json()
  expect(body.recentHistory).toHaveLength(3)
  expect(body.recentHistory[0].id).toBe('h1')
  expect(body.recentHistory[2].id).toBe('h3')
})

test('handles null cache gracefully', async () => {
  mockStore.cache = { radarr: null, sonarr: null } as unknown as typeof mockStore.cache
  const req = new NextRequest('http://localhost/api/dashboard')
  const res = await GET(req)
  const body = await res.json()
  expect(body.movies).toBe(0)
  expect(body.series).toBe(0)
})

test('recentWatched includes all events regardless of matchStatus', async () => {
  const req = new NextRequest('http://localhost/api/dashboard')
  const res = await GET(req)
  const body = await res.json()
  expect(body.recentWatched).toHaveLength(3)
  expect(body.recentWatched[0].id).toBe('w1')
})

test('recentWatched includes unmatched events', async () => {
  const saved = mockStore.watchedEvents
  mockStore.watchedEvents = [{ id: 'w2', matchStatus: 'unmatched', watchedAt: 2000, mediaType: 'movie', title: 'Film B', progressPct: 95, source: 'webhook', mediaServer: 'jellyfin' }] as WatchedEvent[]
  const req = new NextRequest('http://localhost/api/dashboard')
  const res = await GET(req)
  const body = await res.json()
  expect(body.recentWatched).toHaveLength(1)
  expect(body.recentWatched[0].matchStatus).toBe('unmatched')
  mockStore.watchedEvents = saved
})
