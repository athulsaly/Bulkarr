import { v4 as uuidv4 } from 'uuid'
import type { WatchedEvent } from './types'

// ── Jellyfin ───────────────────────────────────────────────────────────────

interface JellyfinUser {
  Id: string
  Policy?: { IsAdministrator?: boolean }
}

interface JellyfinItem {
  Id: string
  Name: string
  Type: string
  ProductionYear?: number
  SeriesName?: string
  ParentIndexNumber?: number
  IndexNumber?: number
  ProviderIds?: { Tmdb?: string; Tvdb?: string }
  UserData?: { PlayedPercentage?: number; LastPlayedDate?: string; Played?: boolean }
}

async function jellyfinFetch(url: string, apiKey: string, path: string): Promise<unknown> {
  const res = await fetch(`${url.replace(/\/+$/, '')}${path}`, {
    headers: { 'X-Emby-Token': apiKey, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Jellyfin ${path} failed: HTTP ${res.status}`)
  return res.json()
}

export async function fetchJellyfinHistory(
  url: string,
  apiKey: string,
  since: number,
  thresholdPct: number,
): Promise<WatchedEvent[]> {
  const users = (await jellyfinFetch(url, apiKey, '/Users')) as JellyfinUser[]
  const admin = users.find(u => u.Policy?.IsAdministrator) ?? users[0]
  if (!admin) return []

  const data = (await jellyfinFetch(
    url,
    apiKey,
    `/Users/${admin.Id}/Items?Recursive=true&Filters=IsPlayed&IncludeItemTypes=Movie,Episode&Fields=ProviderIds,UserData&Limit=200`,
  )) as { Items: JellyfinItem[] }

  return data.Items.flatMap(item => {
    const pct = item.UserData?.PlayedPercentage ?? (item.UserData?.Played ? 100 : 0)
    const lastPlayed = item.UserData?.LastPlayedDate
      ? new Date(item.UserData.LastPlayedDate).getTime()
      : 0
    if (pct < thresholdPct || lastPlayed <= since) return []
    const type = item.Type
    if (type !== 'Movie' && type !== 'Episode') return []
    const event: WatchedEvent = {
      id: uuidv4(),
      source: 'poll',
      mediaServer: 'jellyfin',
      mediaType: type === 'Movie' ? 'movie' : 'episode',
      title: item.Name,
      year: item.ProductionYear,
      tmdbId: item.ProviderIds?.Tmdb ? Number(item.ProviderIds.Tmdb) : undefined,
      tvdbId: item.ProviderIds?.Tvdb ? Number(item.ProviderIds.Tvdb) : undefined,
      seriesTitle: item.SeriesName,
      seasonNumber: item.ParentIndexNumber,
      episodeNumber: item.IndexNumber,
      progressPct: pct,
      watchedAt: lastPlayed,
      matchStatus: 'pending',
    }
    return [event]
  })
}

// ── Plex ───────────────────────────────────────────────────────────────────

interface PlexHistoryItem {
  ratingKey: string
  type: string
  title: string
  year?: number
  grandparentTitle?: string
  parentIndex?: number
  index?: number
  viewedAt: number
  viewOffset?: number
  duration?: number
}

interface PlexGuid { id: string }

async function plexFetch(url: string, token: string, path: string): Promise<unknown> {
  const res = await fetch(`${url.replace(/\/+$/, '')}${path}`, {
    headers: { 'X-Plex-Token': token, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Plex ${path} failed: HTTP ${res.status}`)
  return res.json()
}

function extractPlexId(guids: PlexGuid[], scheme: string): number | undefined {
  const hit = guids.find(g => g.id.startsWith(`${scheme}://`))
  return hit ? Number(hit.id.slice(scheme.length + 3)) : undefined
}

export async function fetchPlexHistory(
  url: string,
  token: string,
  since: number,
  thresholdPct: number,
): Promise<WatchedEvent[]> {
  const data = (await plexFetch(
    url,
    token,
    '/status/sessions/history/all?sort=viewedAt:desc&limit=200',
  )) as { MediaContainer: { Metadata?: PlexHistoryItem[] } }

  const items = data.MediaContainer.Metadata ?? []
  const sinceS = Math.floor(since / 1000)
  const events: WatchedEvent[] = []

  for (const item of items) {
    if (item.viewedAt <= sinceS) continue
    const pct =
      item.viewOffset != null && item.duration && item.duration > 0
        ? (item.viewOffset / item.duration) * 100
        : 100
    if (pct < thresholdPct) continue
    const mediaType = item.type === 'movie' ? 'movie' : item.type === 'episode' ? 'episode' : null
    if (!mediaType) continue

    let tmdbId: number | undefined
    let tvdbId: number | undefined
    try {
      const meta = (await plexFetch(url, token, `/library/metadata/${item.ratingKey}`)) as {
        MediaContainer: { Metadata?: Array<{ Guid?: PlexGuid[] }> }
      }
      const guids = meta.MediaContainer.Metadata?.[0]?.Guid ?? []
      tmdbId = extractPlexId(guids, 'tmdb')
      tvdbId = extractPlexId(guids, 'tvdb')
    } catch { /* skip GUID enrichment if metadata fetch fails */ }

    events.push({
      id: uuidv4(),
      source: 'poll',
      mediaServer: 'plex',
      mediaType,
      title: item.title,
      year: item.year,
      tmdbId,
      tvdbId,
      seriesTitle: item.grandparentTitle,
      seasonNumber: item.parentIndex,
      episodeNumber: item.index,
      progressPct: Math.min(pct, 100),
      watchedAt: item.viewedAt * 1000,
      matchStatus: 'pending',
    })
  }
  return events
}
