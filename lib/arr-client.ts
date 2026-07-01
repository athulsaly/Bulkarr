import type { QualityProfile, RootFolder, LangProfile, LibraryItem, ArrItem, ArrErrorCode } from './types'

export class ArrApiError extends Error {
  code: ArrErrorCode
  httpStatus?: number
  constructor(code: ArrErrorCode, message: string, httpStatus?: number) {
    super(message)
    this.code = code
    this.httpStatus = httpStatus
  }
}

async function arrFetch(baseUrl: string, apiKey: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (e) {
    throw new ArrApiError('UNREACHABLE', `Cannot reach ${baseUrl}: ${(e as Error).message}`)
  }
  if (res.status === 401) throw new ArrApiError('AUTH_FAILED', 'Invalid API key', 401)
  if (res.status === 400) {
    const b = await res.json().catch(() => ({})) as { message?: string }
    throw new ArrApiError('BAD_REQUEST', b.message ?? 'Bad request', 400)
  }
  if (res.status === 404) throw new ArrApiError('NOT_FOUND', 'Not found', 404)
  if (!res.ok) throw new ArrApiError('UNKNOWN', `HTTP ${res.status}`, res.status)
  return res.json()
}

export async function getSystemStatus(url: string, key: string) {
  return arrFetch(url, key, '/api/v3/system/status') as Promise<{ version: string }>
}

export async function getQualityProfiles(url: string, key: string): Promise<QualityProfile[]> {
  return arrFetch(url, key, '/api/v3/qualityprofile') as Promise<QualityProfile[]>
}

export async function getRootFolders(url: string, key: string): Promise<RootFolder[]> {
  return arrFetch(url, key, '/api/v3/rootfolder') as Promise<RootFolder[]>
}

export async function getLangProfiles(url: string, key: string): Promise<LangProfile[]> {
  try { return await arrFetch(url, key, '/api/v3/languageprofile') as LangProfile[] }
  catch { return [] }
}

export async function getMovieLibrary(url: string, key: string): Promise<LibraryItem[]> {
  const items = await arrFetch(url, key, '/api/v3/movie') as Array<{ id: number; title: string; tmdbId: number }>
  return items.map(m => ({ id: m.id, title: m.title, tmdbId: m.tmdbId }))
}

export async function getSeriesLibrary(url: string, key: string): Promise<LibraryItem[]> {
  const items = await arrFetch(url, key, '/api/v3/series') as Array<{ id: number; title: string; tvdbId: number }>
  return items.map(s => ({ id: s.id, title: s.title, tvdbId: s.tvdbId }))
}

function posterFrom(item: { remotePoster?: string; images?: Array<{ coverType: string; remoteUrl: string }> }) {
  return item.remotePoster ?? item.images?.find(i => i.coverType === 'poster')?.remoteUrl
}

type ArrLookupRaw = { title: string; year: number; tmdbId?: number; tvdbId?: number; overview?: string; remotePoster?: string; images?: Array<{ coverType: string; remoteUrl: string }> }

export async function lookupMovies(url: string, key: string, term: string): Promise<ArrItem[]> {
  const r = await arrFetch(url, key, `/api/v3/movie/lookup?term=${encodeURIComponent(term)}`) as ArrLookupRaw[]
  return r.map(m => ({ title: m.title, year: m.year, tmdbId: m.tmdbId, overview: m.overview, remotePoster: posterFrom(m) }))
}

export async function lookupSeries(url: string, key: string, term: string): Promise<ArrItem[]> {
  const r = await arrFetch(url, key, `/api/v3/series/lookup?term=${encodeURIComponent(term)}`) as ArrLookupRaw[]
  return r.map(s => ({ title: s.title, year: s.year, tvdbId: s.tvdbId, overview: s.overview, remotePoster: posterFrom(s) }))
}

export async function addMovie(url: string, key: string, body: {
  tmdbId: number; title: string; qualityProfileId: number; rootFolderPath: string
  monitored: boolean; minimumAvailability: string; addOptions: { searchForMovie: boolean }
}) {
  return arrFetch(url, key, '/api/v3/movie', { method: 'POST', body: JSON.stringify(body) }) as Promise<{ id: number }>
}

export async function addSeries(url: string, key: string, body: {
  tvdbId: number; title: string; qualityProfileId: number; languageProfileId?: number
  rootFolderPath: string; monitored: boolean; seasonFolder: boolean; seriesType: string
  addOptions: { searchForMissingEpisodes: boolean; monitor: string }
}) {
  return arrFetch(url, key, '/api/v3/series', { method: 'POST', body: JSON.stringify(body) }) as Promise<{ id: number }>
}

export async function deleteMovie(url: string, key: string, id: number, deleteFiles: boolean): Promise<void> {
  await arrFetch(url, key, `/api/v3/movie/${id}?deleteFiles=${deleteFiles}`, { method: 'DELETE' })
}

export async function deleteSeries(url: string, key: string, id: number, deleteFiles: boolean): Promise<void> {
  await arrFetch(url, key, `/api/v3/series/${id}?deleteFiles=${deleteFiles}`, { method: 'DELETE' })
}

export async function unmonitorMovie(url: string, key: string, id: number): Promise<void> {
  const movie = await arrFetch(url, key, `/api/v3/movie/${id}`) as Record<string, unknown>
  await arrFetch(url, key, `/api/v3/movie/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...movie, monitored: false }),
  })
}

export async function unmonitorSeries(url: string, key: string, id: number): Promise<void> {
  const series = await arrFetch(url, key, `/api/v3/series/${id}`) as Record<string, unknown>
  await arrFetch(url, key, `/api/v3/series/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...series, monitored: false }),
  })
}
