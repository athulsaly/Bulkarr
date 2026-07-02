// @jest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import { readStore } from '@/lib/store'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkarr-wh-pl-'))
  process.env.DATA_DIR = tmpDir
  jest.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.DATA_DIR
})

function makeFormRequest(payload: unknown) {
  const form = new FormData()
  form.append('payload', JSON.stringify(payload))
  const req = {
    formData: jest.fn().mockResolvedValue(form),
  } as unknown as import('next/server').NextRequest
  return req
}

test('returns 200 and ignores non-scrobble non-stop events', async () => {
  const { POST } = await import('@/app/api/webhook/plex/route')
  const res = await POST(makeFormRequest({ event: 'media.play', Metadata: { type: 'movie' } }))
  expect(res.status).toBe(200)
  expect(readStore().watchedEvents).toHaveLength(0)
})

test('stores event on media.scrobble', async () => {
  const { POST } = await import('@/app/api/webhook/plex/route')
  const payload = {
    event: 'media.scrobble',
    Metadata: {
      type: 'movie', title: 'Inception', year: 2010,
      Guid: [{ id: 'tmdb://27205' }],
    },
  }
  await POST(makeFormRequest(payload))
  const store = readStore()
  expect(store.watchedEvents).toHaveLength(1)
  expect(store.watchedEvents[0]).toMatchObject({
    mediaServer: 'plex', mediaType: 'movie', title: 'Inception',
    tmdbId: 27205, progressPct: 100, source: 'webhook',
  })
})

test('stores episode with tvdb GUID', async () => {
  const { POST } = await import('@/app/api/webhook/plex/route')
  const payload = {
    event: 'media.scrobble',
    Metadata: {
      type: 'episode', title: 'Pilot', grandparentTitle: 'Breaking Bad',
      parentIndex: 1, index: 1,
      Guid: [{ id: 'tvdb://81189' }],
    },
  }
  await POST(makeFormRequest(payload))
  const store = readStore()
  expect(store.watchedEvents[0]).toMatchObject({
    mediaType: 'episode', seriesTitle: 'Breaking Bad',
    seasonNumber: 1, episodeNumber: 1, tvdbId: 81189,
  })
})

test('ignores media.stop below threshold', async () => {
  const { POST } = await import('@/app/api/webhook/plex/route')
  const payload = {
    event: 'media.stop',
    Metadata: { type: 'movie', title: 'Inception', viewOffset: 100, duration: 10_000 },
  }
  await POST(makeFormRequest(payload))
  expect(readStore().watchedEvents).toHaveLength(0)
})

test('returns 200 on malformed payload', async () => {
  const { POST } = await import('@/app/api/webhook/plex/route')
  const req = { formData: jest.fn().mockRejectedValue(new Error('parse error')) } as unknown as import('next/server').NextRequest
  const res = await POST(req)
  expect(res.status).toBe(200)
})
