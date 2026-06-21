// @jest-environment node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeStore, readStore } from '@/lib/store'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkarr-lookup-'))
  process.env.DATA_DIR = tmpDir
  jest.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.DATA_DIR
})

test('POST /api/lookup returns 400 when service not configured', async () => {
  const { POST } = await import('@/app/api/lookup/route')
  const res = await POST(new Request('http://x', {
    method: 'POST', body: JSON.stringify({ target: 'movies', terms: ['Inception'] }),
  }) as any)
  expect(res.status).toBe(400)
})

test('POST /api/lookup returns candidates per term', async () => {
  const store = readStore()
  store.settings.radarr = { url: 'http://radarr:7878', apiKey: 'key' }
  writeStore(store)

  global.fetch = jest.fn().mockResolvedValue({
    ok: true, status: 200,
    json: () => Promise.resolve([{ title: 'Inception', year: 2010, tmdbId: 27205 }]),
  })

  const { POST } = await import('@/app/api/lookup/route')
  const res = await POST(new Request('http://x', {
    method: 'POST', body: JSON.stringify({ target: 'movies', terms: ['Inception', 'Avatar'] }),
  }) as any)

  const json = await res.json()
  expect(json.results).toHaveLength(2)
  expect(json.results[0].candidates[0].title).toBe('Inception')
})

test('POST /api/lookup returns empty candidates on failure without aborting batch', async () => {
  const store = readStore()
  store.settings.radarr = { url: 'http://radarr:7878', apiKey: 'key' }
  writeStore(store)

  global.fetch = jest.fn()
    .mockRejectedValueOnce(new Error('ECONNREFUSED'))
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ title: 'Avatar', year: 2009, tmdbId: 19995 }]) })

  const { POST } = await import('@/app/api/lookup/route')
  const res = await POST(new Request('http://x', {
    method: 'POST', body: JSON.stringify({ target: 'movies', terms: ['bad', 'Avatar'] }),
  }) as any)

  const json = await res.json()
  expect(json.results[0].candidates).toHaveLength(0)
  expect(json.results[0].error).toBeTruthy()
  expect(json.results[1].candidates[0].title).toBe('Avatar')
})
