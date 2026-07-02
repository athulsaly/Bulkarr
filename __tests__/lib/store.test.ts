// @jest-environment node

import fs from 'fs'
import os from 'os'
import path from 'path'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkarr-store-'))
  process.env.DATA_DIR = tmpDir
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.DATA_DIR
  jest.resetModules()
})

test('readStore returns default store when file absent', async () => {
  const { readStore } = await import('@/lib/store')
  const store = readStore()
  expect(store.settings).toEqual({
    radarr: null,
    sonarr: null,
    jellyfin: null,
    plex: null,
    mediaServer: { pollIntervalMinutes: 15, watchedThresholdPct: 90 },
  })
  expect(store.sessions).toEqual({ movies: null, series: null })
})

test('writeStore creates directory and persists data', async () => {
  const { readStore, writeStore } = await import('@/lib/store')
  const store = readStore()
  store.settings.radarr = { url: 'http://localhost:7878', apiKey: 'abc' }
  writeStore(store)
  expect(fs.existsSync(path.join(tmpDir, 'store.json'))).toBe(true)
  const { readStore: read2 } = await import('@/lib/store')
  expect(read2().settings.radarr?.url).toBe('http://localhost:7878')
})

test('updateStore mutates and persists atomically', async () => {
  const { readStore, updateStore } = await import('@/lib/store')
  updateStore(s => { s.settings.sonarr = { url: 'http://sonarr:8989', apiKey: 'xyz' } })
  expect(readStore().settings.sonarr?.apiKey).toBe('xyz')
})
