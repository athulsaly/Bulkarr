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
