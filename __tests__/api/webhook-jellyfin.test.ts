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

test('returns 200 and ignores non-PlaybackStop events', async () => {
  const { POST } = await import('@/app/api/webhook/jellyfin/route')
  const res = await POST(makeRequest({ NotificationType: 'UserDataSaved' }))
  expect(res.status).toBe(200)
  expect(readStore().watchedEvents).toHaveLength(0)
})

test('stores event when progress meets threshold', async () => {
  const { POST } = await import('@/app/api/webhook/jellyfin/route')
  const payload = {
    NotificationType: 'PlaybackStop',
    Item: { Type: 'Movie', Name: 'Inception', ProductionYear: 2010, ProviderIds: { Tmdb: '27205' }, RunTimeTicks: 100 },
    Session: { PlayState: { PositionTicks: 95 } },
  }
  const res = await POST(makeRequest(payload))
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
  const payload = {
    NotificationType: 'PlaybackStop',
    Item: { Type: 'Movie', Name: 'Inception', RunTimeTicks: 100 },
    Session: { PlayState: { PositionTicks: 50 } },
  }
  await POST(makeRequest(payload))
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
  const payload = {
    NotificationType: 'PlaybackStop',
    Item: { Type: 'Movie', Name: 'Inception', ProductionYear: 2010, ProviderIds: { Tmdb: '27205' }, RunTimeTicks: 100 },
    Session: { PlayState: { PositionTicks: 95 } },
  }
  await POST(makeRequest(payload))
  expect(readStore().watchedEvents).toHaveLength(1)
})

test('ignores unknown item types', async () => {
  const { POST } = await import('@/app/api/webhook/jellyfin/route')
  const payload = {
    NotificationType: 'PlaybackStop',
    Item: { Type: 'Unknown', Name: 'Something', RunTimeTicks: 100 },
    Session: { PlayState: { PositionTicks: 95 } },
  }
  await POST(makeRequest(payload))
  expect(readStore().watchedEvents).toHaveLength(0)
})
