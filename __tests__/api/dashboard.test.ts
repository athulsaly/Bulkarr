// @jest-environment node

import { GET } from '@/app/api/dashboard/route'
import { NextRequest } from 'next/server'

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
