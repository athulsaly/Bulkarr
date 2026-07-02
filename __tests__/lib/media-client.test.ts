// @jest-environment node
const BASE_URL = 'http://jellyfin:8096'
const API_KEY = 'testkey'
const NOW = Date.now()

function mockSequential(responses: Array<{ status: number; body: unknown }>) {
  let call = 0
  global.fetch = jest.fn().mockImplementation(() => {
    const r = responses[Math.min(call++, responses.length - 1)]
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: () => Promise.resolve(r.body),
    })
  })
}

afterEach(() => jest.restoreAllMocks())

test('fetchJellyfinHistory returns empty array when no users', async () => {
  mockSequential([{ status: 200, body: [] }])
  const { fetchJellyfinHistory } = await import('@/lib/media-client')
  const result = await fetchJellyfinHistory(BASE_URL, API_KEY, 0, 90)
  expect(result).toEqual([])
})

test('fetchJellyfinHistory maps movie to WatchedEvent', async () => {
  const users = [{ Id: 'u1', Policy: { IsAdministrator: true } }]
  const items = {
    Items: [{
      Id: 'i1', Name: 'Inception', Type: 'Movie', ProductionYear: 2010,
      ProviderIds: { Tmdb: '27205' },
      UserData: { PlayedPercentage: 95, LastPlayedDate: new Date(NOW - 1000).toISOString(), Played: true },
    }],
  }
  mockSequential([{ status: 200, body: users }, { status: 200, body: items }])
  const { fetchJellyfinHistory } = await import('@/lib/media-client')
  const result = await fetchJellyfinHistory(BASE_URL, API_KEY, NOW - 10_000, 90)
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({
    mediaServer: 'jellyfin', mediaType: 'movie', title: 'Inception',
    year: 2010, tmdbId: 27205, progressPct: 95, matchStatus: 'pending', source: 'poll',
  })
  expect(result[0].id).toBeTruthy()
})

test('fetchJellyfinHistory maps episode to WatchedEvent', async () => {
  const users = [{ Id: 'u1', Policy: { IsAdministrator: true } }]
  const items = {
    Items: [{
      Id: 'e1', Name: 'Pilot', Type: 'Episode', SeriesName: 'Breaking Bad',
      ParentIndexNumber: 1, IndexNumber: 1,
      ProviderIds: { Tvdb: '81189' },
      UserData: { PlayedPercentage: 100, LastPlayedDate: new Date(NOW - 1000).toISOString(), Played: true },
    }],
  }
  mockSequential([{ status: 200, body: users }, { status: 200, body: items }])
  const { fetchJellyfinHistory } = await import('@/lib/media-client')
  const result = await fetchJellyfinHistory(BASE_URL, API_KEY, NOW - 10_000, 100)
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({
    mediaType: 'episode', title: 'Pilot', seriesTitle: 'Breaking Bad',
    seasonNumber: 1, episodeNumber: 1, tvdbId: 81189,
  })
})

test('fetchJellyfinHistory filters items below threshold', async () => {
  const users = [{ Id: 'u1', Policy: { IsAdministrator: true } }]
  const items = {
    Items: [{
      Id: 'i1', Name: 'Inception', Type: 'Movie',
      ProviderIds: {},
      UserData: { PlayedPercentage: 50, LastPlayedDate: new Date(NOW - 1000).toISOString() },
    }],
  }
  mockSequential([{ status: 200, body: users }, { status: 200, body: items }])
  const { fetchJellyfinHistory } = await import('@/lib/media-client')
  expect(await fetchJellyfinHistory(BASE_URL, API_KEY, 0, 90)).toHaveLength(0)
})

test('fetchJellyfinHistory filters items before since', async () => {
  const users = [{ Id: 'u1', Policy: { IsAdministrator: true } }]
  const items = {
    Items: [{
      Id: 'i1', Name: 'Inception', Type: 'Movie',
      ProviderIds: {},
      UserData: { PlayedPercentage: 100, LastPlayedDate: new Date(NOW - 100_000).toISOString() },
    }],
  }
  mockSequential([{ status: 200, body: users }, { status: 200, body: items }])
  const { fetchJellyfinHistory } = await import('@/lib/media-client')
  expect(await fetchJellyfinHistory(BASE_URL, API_KEY, NOW, 90)).toHaveLength(0)
})

test('fetchJellyfinHistory throws on HTTP error', async () => {
  mockSequential([{ status: 401, body: {} }])
  const { fetchJellyfinHistory } = await import('@/lib/media-client')
  await expect(fetchJellyfinHistory(BASE_URL, API_KEY, 0, 90)).rejects.toThrow('HTTP 401')
})

const PLEX_URL = 'http://plex:32400'
const PLEX_TOKEN = 'plextoken'

test('fetchPlexHistory maps movie to WatchedEvent', async () => {
  const history = {
    MediaContainer: {
      Metadata: [{
        ratingKey: '42', type: 'movie', title: 'Inception', year: 2010,
        viewedAt: Math.floor((NOW - 1000) / 1000),
        viewOffset: 5700000, duration: 6000000,
      }],
    },
  }
  const meta = { MediaContainer: { Metadata: [{ Guid: [{ id: 'tmdb://27205' }] }] } }
  mockSequential([{ status: 200, body: history }, { status: 200, body: meta }])
  const { fetchPlexHistory } = await import('@/lib/media-client')
  const result = await fetchPlexHistory(PLEX_URL, PLEX_TOKEN, NOW - 10_000, 90)
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({
    mediaServer: 'plex', mediaType: 'movie', title: 'Inception',
    year: 2010, tmdbId: 27205, source: 'poll', matchStatus: 'pending',
  })
  expect(result[0].progressPct).toBeCloseTo(95, 0)
})

test('fetchPlexHistory maps episode to WatchedEvent', async () => {
  const history = {
    MediaContainer: {
      Metadata: [{
        ratingKey: '7', type: 'episode', title: 'Pilot',
        grandparentTitle: 'Breaking Bad', parentIndex: 1, index: 1,
        viewedAt: Math.floor((NOW - 1000) / 1000),
        viewOffset: 2700000, duration: 2700000,
      }],
    },
  }
  const meta = { MediaContainer: { Metadata: [{ Guid: [{ id: 'tvdb://81189' }] }] } }
  mockSequential([{ status: 200, body: history }, { status: 200, body: meta }])
  const { fetchPlexHistory } = await import('@/lib/media-client')
  const result = await fetchPlexHistory(PLEX_URL, PLEX_TOKEN, NOW - 10_000, 90)
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({
    mediaType: 'episode', seriesTitle: 'Breaking Bad',
    seasonNumber: 1, episodeNumber: 1, tvdbId: 81189,
  })
})

test('fetchPlexHistory filters items below threshold', async () => {
  const history = {
    MediaContainer: {
      Metadata: [{
        ratingKey: '42', type: 'movie', title: 'Inception',
        viewedAt: Math.floor((NOW - 1000) / 1000),
        viewOffset: 1000, duration: 100_000,
      }],
    },
  }
  mockSequential([{ status: 200, body: history }])
  const { fetchPlexHistory } = await import('@/lib/media-client')
  expect(await fetchPlexHistory(PLEX_URL, PLEX_TOKEN, NOW - 10_000, 90)).toHaveLength(0)
})

test('fetchPlexHistory filters items before since', async () => {
  const history = {
    MediaContainer: {
      Metadata: [{
        ratingKey: '42', type: 'movie', title: 'Inception',
        viewedAt: Math.floor((NOW - 100_000) / 1000),
        viewOffset: 5700000, duration: 6000000,
      }],
    },
  }
  mockSequential([{ status: 200, body: history }])
  const { fetchPlexHistory } = await import('@/lib/media-client')
  expect(await fetchPlexHistory(PLEX_URL, PLEX_TOKEN, NOW, 90)).toHaveLength(0)
})

test('fetchPlexHistory returns empty on empty MediaContainer', async () => {
  mockSequential([{ status: 200, body: { MediaContainer: {} } }])
  const { fetchPlexHistory } = await import('@/lib/media-client')
  expect(await fetchPlexHistory(PLEX_URL, PLEX_TOKEN, 0, 90)).toEqual([])
})
