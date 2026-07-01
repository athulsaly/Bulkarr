// @jest-environment node

import { getSystemStatus, lookupMovies, lookupSeries, ArrApiError } from '@/lib/arr-client'

const BASE = 'http://test-arr:7878'
const KEY = 'testkey'

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

afterEach(() => jest.restoreAllMocks())

test('sends X-Api-Key header', async () => {
  mockFetch(200, { version: '5.0.0' })
  await getSystemStatus(BASE, KEY)
  expect((global.fetch as jest.Mock).mock.calls[0][1].headers['X-Api-Key']).toBe(KEY)
})

test('throws UNREACHABLE on network error', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
  await expect(getSystemStatus(BASE, KEY)).rejects.toMatchObject({ code: 'UNREACHABLE' })
})

test('throws AUTH_FAILED on 401', async () => {
  mockFetch(401, {})
  await expect(getSystemStatus(BASE, KEY)).rejects.toMatchObject({ code: 'AUTH_FAILED' })
})

test('throws BAD_REQUEST on 400', async () => {
  mockFetch(400, { message: 'already exists' })
  await expect(getSystemStatus(BASE, KEY)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
})

test('lookupMovies maps to ArrItem shape', async () => {
  mockFetch(200, [{ title: 'Inception', year: 2010, tmdbId: 27205, overview: 'A dream', remotePoster: 'http://img/p.jpg' }])
  const r = await lookupMovies(BASE, KEY, 'inception')
  expect(r[0]).toMatchObject({ title: 'Inception', year: 2010, tmdbId: 27205 })
})

test('lookupSeries maps tvdbId', async () => {
  mockFetch(200, [{ title: 'Breaking Bad', year: 2008, tvdbId: 81189, remotePoster: '' }])
  const r = await lookupSeries(BASE, KEY, 'breaking bad')
  expect(r[0].tvdbId).toBe(81189)
})

test('deleteMovie calls DELETE /api/v3/movie/{id}?deleteFiles=true', async () => {
  mockFetch(200, {})
  const { deleteMovie } = await import('@/lib/arr-client')
  await deleteMovie(BASE, KEY, 42, true)
  const call = (global.fetch as jest.Mock).mock.calls[0]
  expect(call[0]).toBe(`${BASE}/api/v3/movie/42?deleteFiles=true`)
  expect(call[1].method).toBe('DELETE')
})

test('deleteMovie calls DELETE with deleteFiles=false', async () => {
  mockFetch(200, {})
  const { deleteMovie } = await import('@/lib/arr-client')
  await deleteMovie(BASE, KEY, 42, false)
  const call = (global.fetch as jest.Mock).mock.calls[0]
  expect(call[0]).toBe(`${BASE}/api/v3/movie/42?deleteFiles=false`)
})

test('deleteSeries calls DELETE /api/v3/series/{id}', async () => {
  mockFetch(200, {})
  const { deleteSeries } = await import('@/lib/arr-client')
  await deleteSeries(BASE, KEY, 7, true)
  const call = (global.fetch as jest.Mock).mock.calls[0]
  expect(call[0]).toBe(`${BASE}/api/v3/series/7?deleteFiles=true`)
  expect(call[1].method).toBe('DELETE')
})

test('unmonitorMovie GETs then PUTs with monitored=false', async () => {
  const fullMovie = { id: 5, title: 'Inception', year: 2010, monitored: true, qualityProfileId: 1, rootFolderPath: '/movies', minimumAvailability: 'released', addOptions: {} }
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(fullMovie) })
    .mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({ ...fullMovie, monitored: false }) })
  const { unmonitorMovie } = await import('@/lib/arr-client')
  await unmonitorMovie(BASE, KEY, 5)
  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls[0][0]).toBe(`${BASE}/api/v3/movie/5`)
  expect(calls[0][1].method).toBeUndefined()
  expect(calls[1][0]).toBe(`${BASE}/api/v3/movie/5`)
  expect(calls[1][1].method).toBe('PUT')
  const putBody = JSON.parse(calls[1][1].body)
  expect(putBody.monitored).toBe(false)
})

test('unmonitorSeries GETs then PUTs with monitored=false', async () => {
  const fullSeries = { id: 3, title: 'Breaking Bad', year: 2008, monitored: true, qualityProfileId: 1, rootFolderPath: '/series', seriesType: 'standard', seasonFolder: true }
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(fullSeries) })
    .mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve({ ...fullSeries, monitored: false }) })
  const { unmonitorSeries } = await import('@/lib/arr-client')
  await unmonitorSeries(BASE, KEY, 3)
  const calls = (global.fetch as jest.Mock).mock.calls
  const putBody = JSON.parse(calls[1][1].body)
  expect(putBody.monitored).toBe(false)
})
