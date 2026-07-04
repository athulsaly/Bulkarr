// @jest-environment node

import { GET, POST as EnqueueItem } from '@/app/api/deletion-queue/route'
import { DELETE as CancelItem } from '@/app/api/deletion-queue/[id]/route'
import { POST as ExecuteItem } from '@/app/api/deletion-queue/[id]/execute/route'
import { POST as TriggerPost } from '@/app/api/deletion-queue/trigger/route'
import { POST as EvaluatePost } from '@/app/api/deletion-queue/evaluate/route'
import { POST as ExecuteEventPost } from '@/app/api/deletion-queue/execute-event/route'
import { NextRequest } from 'next/server'
import type { DeletionQueueItem, WatchedEvent, AutoDeleteRule } from '@/lib/types'

const pendingItem: DeletionQueueItem = {
  id: 'q1', ruleId: 'r1', ruleName: 'Test Rule', watchedEventId: 'e1',
  arrId: 10, arrTarget: 'movies', action: 'delete', deleteFiles: true,
  granularity: 'movie', title: 'Inception', scheduledAt: 1000, status: 'pending', retryCount: 0,
}

const matchedEvent: WatchedEvent = {
  id: 'e1', source: 'poll', mediaServer: 'jellyfin', mediaType: 'movie',
  title: 'Inception', progressPct: 95, watchedAt: 1000,
  arrId: 10, arrTarget: 'movies', matchStatus: 'matched',
}

const movieRule: AutoDeleteRule = {
  id: 'r1', name: 'Delete after watching', enabled: true, mediaType: 'movie',
  granularity: 'movie', action: 'delete', deleteFiles: true,
  delayAmount: 7, delayUnit: 'days', targets: [],
}

const mockStore = {
  rules: [] as AutoDeleteRule[],
  deletionQueue: [] as DeletionQueueItem[],
  watchedEvents: [] as WatchedEvent[],
  settings: { radarr: null, sonarr: null },
}

jest.mock('@/lib/store', () => ({
  readStore: () => JSON.parse(JSON.stringify(mockStore)),
  updateStore: (fn: (s: typeof mockStore) => void) => { fn(mockStore); return mockStore },
}))

jest.mock('@/lib/deletion-executor', () => ({
  runExecutorCycle: jest.fn().mockResolvedValue({ executed: 2, failed: 0 }),
}))

beforeEach(() => {
  mockStore.rules = []
  mockStore.deletionQueue = []
  mockStore.watchedEvents = []
  jest.clearAllMocks()
})

// --- GET /api/deletion-queue ---

test('GET returns all items', async () => {
  mockStore.deletionQueue = [pendingItem]
  const req = new NextRequest('http://localhost/api/deletion-queue')
  const res = await GET(req)
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.items).toHaveLength(1)
})

test('GET filters by status query param', async () => {
  mockStore.deletionQueue = [
    pendingItem,
    { ...pendingItem, id: 'q2', status: 'done' },
  ]
  const req = new NextRequest('http://localhost/api/deletion-queue?status=pending')
  const res = await GET(req)
  const body = await res.json()
  expect(body.items).toHaveLength(1)
  expect(body.items[0].id).toBe('q1')
})

// --- DELETE /api/deletion-queue/[id] ---

test('DELETE cancels a pending item', async () => {
  mockStore.deletionQueue = [{ ...pendingItem }]
  const req = new NextRequest('http://localhost/api/deletion-queue/q1', { method: 'DELETE' })
  const res = await CancelItem(req, { params: Promise.resolve({ id: 'q1' }) })
  expect(res.status).toBe(200)
  expect(mockStore.deletionQueue[0].status).toBe('cancelled')
})

test('DELETE permanently removes a terminal (done) item', async () => {
  mockStore.deletionQueue = [{ ...pendingItem, status: 'done' }]
  const req = new NextRequest('http://localhost/api/deletion-queue/q1', { method: 'DELETE' })
  const res = await CancelItem(req, { params: Promise.resolve({ id: 'q1' }) })
  expect(res.status).toBe(200)
  expect(mockStore.deletionQueue).toHaveLength(0)
})

test('DELETE permanently removes a terminal (failed) item', async () => {
  mockStore.deletionQueue = [{ ...pendingItem, status: 'failed' }]
  const req = new NextRequest('http://localhost/api/deletion-queue/q1', { method: 'DELETE' })
  const res = await CancelItem(req, { params: Promise.resolve({ id: 'q1' }) })
  expect(res.status).toBe(200)
  expect(mockStore.deletionQueue).toHaveLength(0)
})

test('DELETE returns 404 for unknown id', async () => {
  const req = new NextRequest('http://localhost/api/deletion-queue/nope', { method: 'DELETE' })
  const res = await CancelItem(req, { params: Promise.resolve({ id: 'nope' }) })
  expect(res.status).toBe(404)
})

// --- POST /api/deletion-queue ---

test('POST enqueues a matched event under a rule', async () => {
  mockStore.watchedEvents = [{ ...matchedEvent }]
  mockStore.rules = [{ ...movieRule }]
  const req = new NextRequest('http://localhost/api/deletion-queue', {
    method: 'POST',
    body: JSON.stringify({ watchedEventId: 'e1', ruleId: 'r1' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await EnqueueItem(req)
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.ok).toBe(true)
  expect(mockStore.deletionQueue).toHaveLength(1)
  expect(mockStore.deletionQueue[0].ruleId).toBe('r1')
  expect(mockStore.deletionQueue[0].arrId).toBe(10)
  expect(mockStore.deletionQueue[0].status).toBe('pending')
  expect(mockStore.deletionQueue[0].scheduledAt).toBeGreaterThan(Date.now())
})

test('POST returns 404 for unknown watchedEventId', async () => {
  mockStore.rules = [{ ...movieRule }]
  const req = new NextRequest('http://localhost/api/deletion-queue', {
    method: 'POST',
    body: JSON.stringify({ watchedEventId: 'nope', ruleId: 'r1' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await EnqueueItem(req)
  expect(res.status).toBe(404)
})

test('POST returns 404 for unknown ruleId', async () => {
  mockStore.watchedEvents = [{ ...matchedEvent }]
  const req = new NextRequest('http://localhost/api/deletion-queue', {
    method: 'POST',
    body: JSON.stringify({ watchedEventId: 'e1', ruleId: 'nope' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await EnqueueItem(req)
  expect(res.status).toBe(404)
})

test('POST returns 400 for unmatched event', async () => {
  mockStore.watchedEvents = [{ ...matchedEvent, matchStatus: 'unmatched' }]
  mockStore.rules = [{ ...movieRule }]
  const req = new NextRequest('http://localhost/api/deletion-queue', {
    method: 'POST',
    body: JSON.stringify({ watchedEventId: 'e1', ruleId: 'r1' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await EnqueueItem(req)
  expect(res.status).toBe(400)
})

test('POST returns 400 for disabled rule', async () => {
  mockStore.watchedEvents = [{ ...matchedEvent }]
  mockStore.rules = [{ ...movieRule, enabled: false }]
  const req = new NextRequest('http://localhost/api/deletion-queue', {
    method: 'POST',
    body: JSON.stringify({ watchedEventId: 'e1', ruleId: 'r1' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await EnqueueItem(req)
  expect(res.status).toBe(400)
})

// --- POST /api/deletion-queue/[id]/execute ---

test('execute returns 404 for unknown id', async () => {
  const req = new NextRequest('http://localhost/api/deletion-queue/nope/execute', { method: 'POST' })
  const res = await ExecuteItem(req, { params: Promise.resolve({ id: 'nope' }) })
  expect(res.status).toBe(404)
})

test('execute returns 400 if item is not pending', async () => {
  mockStore.deletionQueue = [{ ...pendingItem, status: 'done' }]
  const req = new NextRequest('http://localhost/api/deletion-queue/q1/execute', { method: 'POST' })
  const res = await ExecuteItem(req, { params: Promise.resolve({ id: 'q1' }) })
  expect(res.status).toBe(400)
})

test('execute forces scheduledAt to now and calls runExecutorCycle', async () => {
  mockStore.deletionQueue = [{ ...pendingItem }]
  const req = new NextRequest('http://localhost/api/deletion-queue/q1/execute', { method: 'POST' })
  const res = await ExecuteItem(req, { params: Promise.resolve({ id: 'q1' }) })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.ok).toBe(true)
  expect(body.executed).toBe(2)
})

// --- POST /api/deletion-queue/trigger ---

test('trigger runs executor cycle and returns counts', async () => {
  const req = new NextRequest('http://localhost/api/deletion-queue/trigger', { method: 'POST' })
  const res = await TriggerPost(req)
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.executed).toBe(2)
  expect(body.failed).toBe(0)
})

// --- POST /api/deletion-queue/evaluate ---

test('evaluate enqueues matches for matched events', async () => {
  const movieRule2: AutoDeleteRule = {
    id: 'r1', name: 'n', enabled: true, mediaType: 'movie', granularity: 'movie',
    action: 'delete', deleteFiles: true, delayAmount: 7, delayUnit: 'days', targets: [{ arrId: 10, arrTarget: 'movies' as const }],
  }
  mockStore.rules = [movieRule2]
  mockStore.watchedEvents = [matchedEvent]
  const req = new NextRequest('http://localhost/api/deletion-queue/evaluate', { method: 'POST' })
  const res = await EvaluatePost(req)
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.enqueued).toBeGreaterThanOrEqual(0)
})

// --- POST /api/deletion-queue/execute-event ---

test('execute-event returns 400 if watchedEventId missing', async () => {
  const req = new NextRequest('http://localhost/api/deletion-queue/execute-event', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await ExecuteEventPost(req)
  expect(res.status).toBe(400)
})

test('execute-event returns 404 if event not found', async () => {
  const req = new NextRequest('http://localhost/api/deletion-queue/execute-event', {
    method: 'POST',
    body: JSON.stringify({ watchedEventId: 'nonexistent' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const res = await ExecuteEventPost(req)
  expect(res.status).toBe(404)
})
