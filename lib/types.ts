export interface QualityProfile {
  id: number
  name: string
}

export interface RootFolder {
  id: number
  path: string
  freeSpace?: number
}

export interface LangProfile {
  id: number
  name: string
}

export interface LibraryItem {
  id: number
  title: string
  tmdbId?: number
  tvdbId?: number
}

export interface ArrItem {
  title: string
  year: number
  tmdbId?: number
  tvdbId?: number
  overview?: string
  remotePoster?: string
}

export interface DefaultsConfig {
  qualityProfileId: number
  rootFolderPath: string
  monitored: boolean
  minimumAvailability?: 'announced' | 'inCinemas' | 'released'
  searchOnAdd: boolean
  seriesType?: 'standard' | 'anime' | 'daily'
  seasonFolder?: boolean
  monitorOption?: string
}

export type RowStatus = 'pending' | 'matched' | 'no_match' | 'in_library' | 'added' | 'failed'

export interface ReviewRow {
  id: string
  inputText: string
  candidates: ArrItem[]
  selectedIndex: number
  overrides: Partial<DefaultsConfig>
  included: boolean
  status: RowStatus
  errorMessage?: string
}

export type Target = 'movies' | 'series'

export interface Session {
  target: Target
  defaults: DefaultsConfig
  rawInput: string
  rows: ReviewRow[]
  updatedAt: number
}

export interface ServiceConfig {
  url: string
  apiKey: string
}

export interface Settings {
  radarr: ServiceConfig | null
  sonarr: ServiceConfig | null
  tmdbApiKey?: string
  jellyfin: ServiceConfig | null
  plex: ServiceConfig | null
  mediaServer: MediaServerConfig
}

export interface ServiceCache {
  profiles: QualityProfile[]
  rootFolders: RootFolder[]
  langProfiles?: LangProfile[]
  library: LibraryItem[]
  fetchedAt: number
}

export interface Cache {
  radarr: ServiceCache | null
  sonarr: ServiceCache | null
}

export interface HistoryItem {
  id: string
  title: string
  year?: number
  target: 'movies' | 'series'
  tmdbId?: number
  tvdbId?: number
  remotePoster?: string
  addedAt: number
}

export interface Store {
  settings: Settings
  cache: Cache
  sessions: { movies: Session | null; series: Session | null }
  history: HistoryItem[]
  watchedEvents: WatchedEvent[]
  lastPolledAt: Partial<Record<MediaServerType, number>>
}

export type ArrErrorCode = 'UNREACHABLE' | 'AUTH_FAILED' | 'BAD_REQUEST' | 'NOT_FOUND' | 'UNKNOWN'

export interface SubmitResult {
  rowId: string
  status: 'added' | 'failed'
  errorCode?: ArrErrorCode
  errorMessage?: string
}

export type ManageAction = 'remove' | 'unmonitor'

export type ManageRowStatus = 'pending' | 'matched' | 'no_match' | 'done' | 'failed'

export interface ManageRow {
  id: string
  inputText: string
  libraryMatches: LibraryItem[]
  selectedIndex: number
  action: ManageAction
  status: ManageRowStatus
  errorMessage?: string
}

export interface ManageResult {
  rowId: string
  status: 'done' | 'failed'
  errorCode?: ArrErrorCode
  errorMessage?: string
}

export type MediaServerType = 'jellyfin' | 'plex'

export interface MediaServerConfig {
  pollIntervalMinutes: number
  watchedThresholdPct: number
}

export interface WatchedEvent {
  id: string
  source: 'webhook' | 'poll'
  mediaServer: MediaServerType
  mediaType: 'movie' | 'episode'
  title: string
  year?: number
  tmdbId?: number
  tvdbId?: number
  seriesTitle?: string
  seasonNumber?: number
  episodeNumber?: number
  progressPct: number
  watchedAt: number
  arrId?: number
  arrTarget?: 'movies' | 'series'
  matchStatus: 'matched' | 'unmatched' | 'pending'
}
