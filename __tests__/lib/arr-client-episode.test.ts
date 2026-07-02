// @jest-environment node

import {
  getSeasonEpisodeFileCount,
  deleteEpisodeFile,
  deleteSeasonFiles,
  unmonitorEpisode,
  unmonitorSeason,
} from '@/lib/arr-client'

const BASE = 'http://sonarr:8989'
const KEY = 'testkey'

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

afterEach(() => jest.restoreAllMocks())

// --- getSeasonEpisodeFileCount ---

test('getSeasonEpisodeFileCount returns count of episode files', async () => {
  mockFetch(200, [{ id: 1 }, { id: 2 }, { id: 3 }])
  const count = await getSeasonEpisodeFileCount(BASE, KEY, 42, 1)
  expect(count).toBe(3)
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/v3/episodefile?seriesId=42&seasonNumber=1')
})

test('getSeasonEpisodeFileCount returns 0 for empty season', async () => {
  mockFetch(200, [])
  expect(await getSeasonEpisodeFileCount(BASE, KEY, 42, 1)).toBe(0)
})

// --- deleteEpisodeFile ---

test('deleteEpisodeFile deletes the matching episode file', async () => {
  const episodes = [
    { id: 101, episodeNumber: 1, episodeFileId: 201 },
    { id: 102, episodeNumber: 2, episodeFileId: 202 },
  ]
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(episodes) } as Response)
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)

  await deleteEpisodeFile(BASE, KEY, 42, 1, 2)

  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls[0][0]).toContain('/api/v3/episode?seriesId=42&seasonNumber=1')
  expect(calls[1][0]).toContain('/api/v3/episodefile/202')
  expect(calls[1][1].method).toBe('DELETE')
})

test('deleteEpisodeFile is no-op if episode not found', async () => {
  const episodes = [{ id: 101, episodeNumber: 3, episodeFileId: 201 }]
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(episodes) } as Response)

  await deleteEpisodeFile(BASE, KEY, 42, 1, 99)

  // Only one call (the GET) — no DELETE
  expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
})

test('deleteEpisodeFile is no-op if episodeFileId is 0', async () => {
  const episodes = [{ id: 101, episodeNumber: 1, episodeFileId: 0 }]
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(episodes) } as Response)

  await deleteEpisodeFile(BASE, KEY, 42, 1, 1)
  expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
})

// --- deleteSeasonFiles ---

test('deleteSeasonFiles deletes all episode files in parallel', async () => {
  const files = [{ id: 301 }, { id: 302 }, { id: 303 }]
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(files) } as Response)
    .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)

  await deleteSeasonFiles(BASE, KEY, 42, 1)

  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls[0][0]).toContain('/api/v3/episodefile?seriesId=42&seasonNumber=1')
  const deleteCalls = calls.slice(1)
  expect(deleteCalls).toHaveLength(3)
  expect(deleteCalls.every((c: [string, RequestInit]) => c[1].method === 'DELETE')).toBe(true)
  expect(deleteCalls.map((c: [string, RequestInit]) => c[0]).sort()).toEqual([
    `${BASE}/api/v3/episodefile/301`,
    `${BASE}/api/v3/episodefile/302`,
    `${BASE}/api/v3/episodefile/303`,
  ].sort())
})

test('deleteSeasonFiles is no-op when no files exist', async () => {
  mockFetch(200, [])
  await deleteSeasonFiles(BASE, KEY, 42, 1)
  expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
})

// --- unmonitorEpisode ---

test('unmonitorEpisode sets monitored=false for the episode', async () => {
  const episodes = [
    { id: 101, episodeNumber: 1, monitored: true, seriesId: 42 },
    { id: 102, episodeNumber: 2, monitored: true, seriesId: 42 },
  ]
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(episodes) } as Response)
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)

  await unmonitorEpisode(BASE, KEY, 42, 1, 1)

  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls[0][0]).toContain('/api/v3/episode?seriesId=42&seasonNumber=1')
  expect(calls[1][0]).toContain('/api/v3/episode/101')
  expect(calls[1][1].method).toBe('PUT')
  const putBody = JSON.parse(calls[1][1].body as string)
  expect(putBody.monitored).toBe(false)
  expect(putBody.id).toBe(101)
})

test('unmonitorEpisode is no-op if episode not found', async () => {
  mockFetch(200, [{ id: 101, episodeNumber: 5, monitored: true }])
  await unmonitorEpisode(BASE, KEY, 42, 1, 99)
  expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
})

// --- unmonitorSeason ---

test('unmonitorSeason sets the season monitored=false and PUTs the series', async () => {
  const series = {
    id: 42,
    title: 'Breaking Bad',
    monitored: true,
    seasons: [
      { seasonNumber: 0, monitored: false },
      { seasonNumber: 1, monitored: true },
      { seasonNumber: 2, monitored: true },
    ],
  }
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(series) } as Response)
    .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)

  await unmonitorSeason(BASE, KEY, 42, 1)

  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls[0][0]).toContain('/api/v3/series/42')
  expect(calls[1][0]).toContain('/api/v3/series/42')
  expect(calls[1][1].method).toBe('PUT')

  const putBody = JSON.parse(calls[1][1].body as string)
  const s1 = (putBody.seasons as Array<{ seasonNumber: number; monitored: boolean }>).find(s => s.seasonNumber === 1)
  const s2 = (putBody.seasons as Array<{ seasonNumber: number; monitored: boolean }>).find(s => s.seasonNumber === 2)
  expect(s1?.monitored).toBe(false)
  expect(s2?.monitored).toBe(true)
})
