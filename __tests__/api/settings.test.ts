// @jest-environment node

import fs from 'fs'
import os from 'os'
import path from 'path'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkarr-settings-'))
  process.env.DATA_DIR = tmpDir
  jest.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.DATA_DIR
  delete process.env.RADARR_URL
  delete process.env.RADARR_API_KEY
})

test('GET returns null settings when store is empty', async () => {
  const { GET } = await import('@/app/api/settings/route')
  const json = await (await GET()).json()
  expect(json.settings.radarr).toBeNull()
})

test('GET seeds from env vars on first boot', async () => {
  process.env.RADARR_URL = 'http://radarr:7878'
  process.env.RADARR_API_KEY = 'secretkey123'
  const { GET } = await import('@/app/api/settings/route')
  const json = await (await GET()).json()
  expect(json.settings.radarr?.url).toBe('http://radarr:7878')
  expect(json.settings.radarr?.apiKey).not.toBe('secretkey123')
  expect(json.settings.radarr?.apiKey).toMatch(/•/)
})

test('POST saves config and GET returns masked key', async () => {
  const { POST, GET } = await import('@/app/api/settings/route')
  await POST(new Request('http://x/api/settings', {
    method: 'POST',
    body: JSON.stringify({ radarr: { url: 'http://radarr:7878', apiKey: 'abc123def456' } }),
  }) as any)
  const json = await (await GET()).json()
  expect(json.settings.radarr?.url).toBe('http://radarr:7878')
  expect(json.settings.radarr?.apiKey).not.toBe('abc123def456')
})

test('POST saves session data', async () => {
  const { POST, GET } = await import('@/app/api/settings/route')
  const session = { target: 'movies', defaults: {}, rawInput: 'Inception', rows: [], updatedAt: 1 }
  await POST(new Request('http://x/api/settings', {
    method: 'POST',
    body: JSON.stringify({ session, target: 'movies' }),
  }) as any)
  const json = await (await GET()).json()
  expect(json.sessions.movies?.rawInput).toBe('Inception')
})
