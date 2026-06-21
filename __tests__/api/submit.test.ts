// @jest-environment node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeStore, readStore } from '@/lib/store'
import type { ReviewRow, DefaultsConfig } from '@/lib/types'

let tmpDir: string

const DEFAULTS: DefaultsConfig = {
  qualityProfileId: 1, rootFolderPath: '/movies', monitored: true,
  minimumAvailability: 'released', searchOnAdd: true,
}

const ROW: ReviewRow = {
  id: 'r1', inputText: 'Inception',
  candidates: [{ title: 'Inception', year: 2010, tmdbId: 27205 }],
  selectedIndex: 0, overrides: {}, included: true, status: 'matched',
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkarr-submit-'))
  process.env.DATA_DIR = tmpDir
  jest.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.DATA_DIR
})

test('POST /api/submit returns added status on success', async () => {
  const store = readStore()
  store.settings.radarr = { url: 'http://radarr:7878', apiKey: 'key' }
  writeStore(store)

  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: 1 }) })

  const { POST } = await import('@/app/api/submit/route')
  const res = await POST(new Request('http://x', {
    method: 'POST', body: JSON.stringify({ target: 'movies', rows: [ROW], defaults: DEFAULTS }),
  }) as any)

  const json = await res.json()
  expect(json.results[0]).toMatchObject({ rowId: 'r1', status: 'added' })
})

test('POST /api/submit returns failed status on ArrApiError', async () => {
  const store = readStore()
  store.settings.radarr = { url: 'http://radarr:7878', apiKey: 'key' }
  writeStore(store)

  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ message: 'already exists' }) })

  const { POST } = await import('@/app/api/submit/route')
  const res = await POST(new Request('http://x', {
    method: 'POST', body: JSON.stringify({ target: 'movies', rows: [ROW], defaults: DEFAULTS }),
  }) as any)

  const json = await res.json()
  expect(json.results[0]).toMatchObject({ rowId: 'r1', status: 'failed', errorCode: 'BAD_REQUEST' })
})
