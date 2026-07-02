// @jest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeStore, readStore } from '@/lib/store'
import type { WatchedEvent } from '@/lib/types'

let tmpDir: string

const EVENT: WatchedEvent = {
  id: 'ev1', source: 'webhook', mediaServer: 'jellyfin', mediaType: 'movie',
  title: 'Inception', tmdbId: 27205, progressPct: 95,
  watchedAt: Date.now(), matchStatus: 'unmatched',
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkarr-watched-'))
  process.env.DATA_DIR = tmpDir
  jest.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.DATA_DIR
})

test('GET /api/watched returns events and lastPolledAt', async () => {
  const store = readStore()
  store.watchedEvents = [EVENT]
  store.lastPolledAt = { jellyfin: 1234567890 }
  writeStore(store)
  const { GET } = await import('@/app/api/watched/route')
  const res = await GET()
  const json = await res.json()
  expect(json.events).toHaveLength(1)
  expect(json.events[0].id).toBe('ev1')
  expect(json.lastPolledAt.jellyfin).toBe(1234567890)
})

test('DELETE /api/watched with {} clears all events', async () => {
  const store = readStore()
  store.watchedEvents = [EVENT]
  writeStore(store)
  const { DELETE } = await import('@/app/api/watched/route')
  await DELETE(new Request('http://x', { method: 'DELETE', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } }) as any)
  expect(readStore().watchedEvents).toHaveLength(0)
})

test('DELETE /api/watched with { id } removes specific event', async () => {
  const store = readStore()
  store.watchedEvents = [EVENT, { ...EVENT, id: 'ev2', title: 'Dune' }]
  writeStore(store)
  const { DELETE } = await import('@/app/api/watched/route')
  await DELETE(new Request('http://x', { method: 'DELETE', body: JSON.stringify({ id: 'ev1' }), headers: { 'Content-Type': 'application/json' } }) as any)
  const remaining = readStore().watchedEvents
  expect(remaining).toHaveLength(1)
  expect(remaining[0].id).toBe('ev2')
})

test('POST /api/watched/rematch updates unmatched events', async () => {
  const store = readStore()
  store.watchedEvents = [EVENT]
  store.cache.radarr = { profiles: [], rootFolders: [], library: [{ id: 42, title: 'Inception', tmdbId: 27205 }], fetchedAt: Date.now() }
  writeStore(store)
  const { POST } = await import('@/app/api/watched/rematch/route')
  const res = await POST()
  const json = await res.json()
  expect(json.updated).toBe(1)
  expect(readStore().watchedEvents[0].matchStatus).toBe('matched')
  expect(readStore().watchedEvents[0].arrId).toBe(42)
})

test('POST /api/watched/rematch skips already-matched events', async () => {
  const store = readStore()
  store.watchedEvents = [{ ...EVENT, matchStatus: 'matched', arrId: 42, arrTarget: 'movies' }]
  writeStore(store)
  const { POST } = await import('@/app/api/watched/rematch/route')
  const res = await POST()
  const json = await res.json()
  expect(json.updated).toBe(0)
})
