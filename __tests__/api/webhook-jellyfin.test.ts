// @jest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeStore, readStore } from '@/lib/store'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkarr-wh-jf-'))
  process.env.DATA_DIR = tmpDir
  jest.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.DATA_DIR
})

function makeRequest(body: unknown) {
  return new Request('http://x/api/webhook/jellyfin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

// Flat payload format as sent by the real Jellyfin webhook plugin
const stopPayload = {
  NotificationType: 'PlaybackStop',
  ItemType: 'Movie',
  Name: 'Inception',
  Year: 2010,
  Provider_tmdb: '27205',
  RunTimeTicks: 100,
  PlaybackPositionTicks: 95,
  Id: 'session-abc',
}

test('returns 200 and ignores non-playback events', async () => {
  const { POST } = await import('@/app/api/webhook/jellyfin/route')
  const res = await POST(makeRequest({ NotificationType: 'UserDataSaved' }))
  expect(res.status).toBe(200)
  expect(readStore().watchedEvents).toHaveLength(0)
})

test('stores event when progress meets threshold', async () => {
  const { POST } = await import('@/app/api/webhook/jellyfin/route')
  const res = await POST(makeRequest(stopPayload))
  expect(res.status).toBe(200)
  const store = readStore()
  expect(store.watchedEvents).toHaveLength(1)
  expect(store.watchedEvents[0]).toMatchObject({
    mediaServer: 'jellyfin', mediaType: 'movie', title: 'Inception',
    tmdbId: 27205, source: 'webhook', matchStatus: 'pending',
  })
})

test('ignores event when progress is below threshold', async () => {
  const { POST } = await import('@/app/api/webhook/jellyfin/route')
  await POST(makeRequest({ ...stopPayload, PlaybackPositionTicks: 50 }))
  expect(readStore().watchedEvents).toHaveLength(0)
})

test('deduplicates webhook + poll event for same item', async () => {
  const store = readStore()
  store.watchedEvents = [{
    id: 'existing', source: 'poll', mediaServer: 'jellyfin', mediaType: 'movie',
    title: 'Inception', tmdbId: 27205, progressPct: 95,
    watchedAt: Date.now(), matchStatus: 'pending',
  }]
  writeStore(store)
  const { POST } = await import('@/app/api/webhook/jellyfin/route')
  await POST(makeRequest(stopPayload))
  expect(readStore().watchedEvents).toHaveLength(1)
})

test('ignores unknown item types', async () => {
  const { POST } = await import('@/app/api/webhook/jellyfin/route')
  await POST(makeRequest({ ...stopPayload, ItemType: 'Unknown' }))
  expect(readStore().watchedEvents).toHaveLength(0)
})

test('upserts nowPlaying on PlaybackStart', async () => {
  const { POST } = await import('@/app/api/webhook/jellyfin/route')
  await POST(makeRequest({ ...stopPayload, NotificationType: 'PlaybackStart' }))
  expect(readStore().nowPlaying).toHaveLength(1)
  expect(readStore().nowPlaying[0]).toMatchObject({ sessionId: 'session-abc', title: 'Inception' })
})

test('removes from nowPlaying on PlaybackStop', async () => {
  const { POST } = await import('@/app/api/webhook/jellyfin/route')
  await POST(makeRequest({ ...stopPayload, NotificationType: 'PlaybackStart' }))
  await POST(makeRequest(stopPayload))
  expect(readStore().nowPlaying).toHaveLength(0)
})
