// @jest-environment node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeStore, readStore } from '@/lib/store'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkarr-cache-'))
  process.env.DATA_DIR = tmpDir
  jest.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.DATA_DIR
})

test('POST /api/cache returns 400 when service not configured', async () => {
  const { POST } = await import('@/app/api/cache/route')
  const res = await POST(new Request('http://x/api/cache', {
    method: 'POST', body: JSON.stringify({ service: 'radarr' }),
  }) as any)
  expect(res.status).toBe(400)
})

test('POST /api/cache fetches and saves radarr profiles and library', async () => {
  const store = readStore()
  store.settings.radarr = { url: 'http://radarr:7878', apiKey: 'key' }
  writeStore(store)

  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ id: 1, name: 'HD' }]) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ id: 1, path: '/movies', freeSpace: 0 }]) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ id: 10, title: 'Inception', tmdbId: 27205 }]) })

  const { POST } = await import('@/app/api/cache/route')
  const res = await POST(new Request('http://x/api/cache', {
    method: 'POST', body: JSON.stringify({ service: 'radarr' }),
  }) as any)

  expect(res.status).toBe(200)
  const saved = readStore()
  expect(saved.cache.radarr?.profiles[0].name).toBe('HD')
  expect(saved.cache.radarr?.library[0].tmdbId).toBe(27205)
})
