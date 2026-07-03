// @jest-environment node

import { GET, POST } from '@/app/api/rules/route'
import { GET as GETById, PUT, DELETE as DELETEById } from '@/app/api/rules/[id]/route'
import { NextRequest } from 'next/server'

// Mock store
const mockStore = {
  rules: [] as import('@/lib/types').AutoDeleteRule[],
  deletionQueue: [] as import('@/lib/types').DeletionQueueItem[],
  watchedEvents: [] as import('@/lib/types').WatchedEvent[],
  settings: { radarr: null, sonarr: null },
}

jest.mock('@/lib/store', () => ({
  readStore: () => JSON.parse(JSON.stringify(mockStore)),
  updateStore: (fn: (s: typeof mockStore) => void) => { fn(mockStore); return mockStore },
}))

jest.mock('@/lib/deletion-executor', () => ({
  enqueueRuleMatches: jest.fn(),
}))

beforeEach(() => {
  mockStore.rules = []
  mockStore.deletionQueue = []
  mockStore.watchedEvents = []
})

afterEach(() => jest.clearAllMocks())

function makeReq(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/rules', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const validRule = {
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

// --- GET /api/rules ---

test('GET returns empty rules list', async () => {
  const res = await GET()
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.rules).toEqual([])
})

test('GET returns existing rules', async () => {
  mockStore.rules = [{ ...validRule, id: 'r1' } as import('@/lib/types').AutoDeleteRule]
  const res = await GET()
  const body = await res.json()
  expect(body.rules).toHaveLength(1)
})

// --- POST /api/rules ---

test('POST creates a rule and returns it with enqueued count', async () => {
  const res = await POST(makeReq(validRule))
  const body = await res.json()
  expect(res.status).toBe(201)
  expect(body.rule.name).toBe('Delete watched movies')
  expect(typeof body.rule.id).toBe('string')
  expect(body.enqueued).toBe(0)
  expect(mockStore.rules).toHaveLength(1)
})

test('POST returns 400 when delayAmount < 1', async () => {
  const res = await POST(makeReq({ ...validRule, delayAmount: 0 }))
  expect(res.status).toBe(400)
})

test('POST returns 400 when delayUnit is invalid', async () => {
  const res = await POST(makeReq({ ...validRule, delayUnit: 'hours' }))
  expect(res.status).toBe(400)
})

test('POST returns 400 when scope=specific missing arrId', async () => {
  const res = await POST(makeReq({ ...validRule, scope: 'specific' }))
  expect(res.status).toBe(400)
})

test('POST returns 400 when granularity=season but mediaType=movie', async () => {
  const res = await POST(makeReq({ ...validRule, granularity: 'season' }))
  expect(res.status).toBe(400)
})

test('POST returns 400 when granularity=movie but mediaType=series', async () => {
  const res = await POST(makeReq({ ...validRule, mediaType: 'series', granularity: 'movie' }))
  expect(res.status).toBe(400)
})

// --- GET /api/rules/[id] ---

test('GET /api/rules/[id] returns 404 for unknown id', async () => {
  const req = new NextRequest('http://localhost/api/rules/nope')
  const res = await GETById(req, { params: Promise.resolve({ id: 'nope' }) })
  expect(res.status).toBe(404)
})

// --- PUT /api/rules/[id] ---

test('PUT updates a rule', async () => {
  mockStore.rules = [{ ...validRule, id: 'r1' } as import('@/lib/types').AutoDeleteRule]
  const req = new NextRequest('http://localhost/api/rules/r1', {
    method: 'PUT',
    body: JSON.stringify({ ...validRule, name: 'Updated' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await PUT(req, { params: Promise.resolve({ id: 'r1' }) })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.rule.name).toBe('Updated')
})

test('PUT returns 404 for unknown id', async () => {
  const req = new NextRequest('http://localhost/api/rules/nope', {
    method: 'PUT',
    body: JSON.stringify(validRule),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await PUT(req, { params: Promise.resolve({ id: 'nope' }) })
  expect(res.status).toBe(404)
})

// --- DELETE /api/rules/[id] ---

test('DELETE removes a rule and cancels its pending queue items', async () => {
  mockStore.rules = [{ ...validRule, id: 'r1' } as import('@/lib/types').AutoDeleteRule]
  mockStore.deletionQueue = [{
    id: 'q1', ruleId: 'r1', ruleName: 'n', watchedEventId: 'e1',
    arrId: 10, arrTarget: 'movies', action: 'delete', deleteFiles: true,
    granularity: 'movie', title: 'T', scheduledAt: 999, status: 'pending', retryCount: 0,
  }]
  const req = new NextRequest('http://localhost/api/rules/r1', { method: 'DELETE' })
  const res = await DELETEById(req, { params: Promise.resolve({ id: 'r1' }) })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.ok).toBe(true)
  expect(mockStore.rules).toHaveLength(0)
  expect(mockStore.deletionQueue[0].status).toBe('cancelled')
})

test('DELETE returns 404 for unknown id', async () => {
  const req = new NextRequest('http://localhost/api/rules/nope', { method: 'DELETE' })
  const res = await DELETEById(req, { params: Promise.resolve({ id: 'nope' }) })
  expect(res.status).toBe(404)
})
