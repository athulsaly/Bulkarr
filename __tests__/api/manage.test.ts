// @jest-environment node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeStore, readStore } from '@/lib/store'
import type { ManageRow } from '@/lib/types'

let tmpDir: string

const REMOVE_ROW: ManageRow = {
  id: 'r1',
  inputText: 'Inception',
  libraryMatches: [{ id: 42, title: 'Inception', tmdbId: 27205 }],
  selectedIndex: 0,
  action: 'remove',
  status: 'matched',
}

const UNMONITOR_ROW: ManageRow = {
  id: 'r2',
  inputText: 'Breaking Bad',
  libraryMatches: [{ id: 7, title: 'Breaking Bad', tvdbId: 81189 }],
  selectedIndex: 0,
  action: 'unmonitor',
  status: 'matched',
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulkarr-manage-'))
  process.env.DATA_DIR = tmpDir
  jest.resetModules()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.DATA_DIR
})

test('POST /api/manage returns 400 when service not configured', async () => {
  const { POST } = await import('@/app/api/manage/route')
  const res = await POST(new Request('http://x', {
    method: 'POST',
    body: JSON.stringify({ target: 'movies', rows: [REMOVE_ROW], deleteFiles: false }),
  }) as any)
  expect(res.status).toBe(400)
})

test('POST /api/manage calls DELETE for remove action', async () => {
  const store = readStore()
  store.settings.radarr = { url: 'http://radarr:7878', apiKey: 'key' }
  writeStore(store)

  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })

  const { POST } = await import('@/app/api/manage/route')
  const res = await POST(new Request('http://x', {
    method: 'POST',
    body: JSON.stringify({ target: 'movies', rows: [REMOVE_ROW], deleteFiles: true }),
  }) as any)

  const json = await res.json()
  expect(json.results[0]).toMatchObject({ rowId: 'r1', status: 'done' })
  const call = (global.fetch as jest.Mock).mock.calls[0]
  expect(call[0]).toContain('/api/v3/movie/42')
  expect(call[0]).toContain('deleteFiles=true')
  expect(call[1].method).toBe('DELETE')
})

test('POST /api/manage calls GET then PUT for unmonitor action', async () => {
  const store = readStore()
  store.settings.sonarr = { url: 'http://sonarr:8989', apiKey: 'key' }
  writeStore(store)

  const fullSeries = { id: 7, title: 'Breaking Bad', monitored: true }
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(fullSeries) })
    .mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({ ...fullSeries, monitored: false }) })

  const { POST } = await import('@/app/api/manage/route')
  const res = await POST(new Request('http://x', {
    method: 'POST',
    body: JSON.stringify({ target: 'series', rows: [UNMONITOR_ROW], deleteFiles: false }),
  }) as any)

  const json = await res.json()
  expect(json.results[0]).toMatchObject({ rowId: 'r2', status: 'done' })
})

test('POST /api/manage returns failed status on ArrApiError', async () => {
  const store = readStore()
  store.settings.radarr = { url: 'http://radarr:7878', apiKey: 'key' }
  writeStore(store)

  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({}) })

  const { POST } = await import('@/app/api/manage/route')
  const res = await POST(new Request('http://x', {
    method: 'POST',
    body: JSON.stringify({ target: 'movies', rows: [REMOVE_ROW], deleteFiles: false }),
  }) as any)

  const json = await res.json()
  expect(json.results[0]).toMatchObject({ rowId: 'r1', status: 'failed', errorCode: 'NOT_FOUND' })
})
