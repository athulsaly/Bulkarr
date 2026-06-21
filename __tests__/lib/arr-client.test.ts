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
