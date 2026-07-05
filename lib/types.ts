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
  year?: number
  tmdbId?: number
  tvdbId?: number
}

export interface LibraryItemFull extends LibraryItem {
  monitored: boolean
  hasFile: boolean
  qualityProfileId: number
  qualityProfileName?: string
  sizeOnDisk: number
  addedDate: string
  posterUrl?: string
  arrStatus?: string
  assignedRules: AutoDeleteRule[]
}

export interface PosterCache {
  movies: Record<number, string>
  series: Record<number, string>
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

export interface RuleTarget {
  arrId: number
  arrTarget: 'movies' | 'series'
  scopeTitle?: string
}

export interface AutoDeleteRule {
  id: string
  name: string
  enabled: boolean
  mediaType: 'movie' | 'series'
  granularity: 'movie' | 'episode' | 'season'
  action: 'delete' | 'unmonitor'
  deleteFiles: boolean
  delayAmount: number
  delayUnit: 'days' | 'weeks' | 'months' | 'year'
  targets: RuleTarget[]
}

export type DeletionQueueStatus = 'pending' | 'done' | 'failed' | 'cancelled'

export interface DeletionQueueItem {
  id: string
  ruleId: string
  ruleName: string
  watchedEventId: string
  arrId: number
  arrTarget: 'movies' | 'series'
  action: 'delete' | 'unmonitor'
  deleteFiles: boolean
  granularity: 'movie' | 'episode' | 'season'
  title: string
  seriesTitle?: string
  seasonNumber?: number
  episodeNumber?: number
  scheduledAt: number
  status: DeletionQueueStatus
  retryCount: number
  executedAt?: number
  errorMessage?: string
}

export interface NowPlayingItem {
  sessionId: string
  mediaServer: MediaServerType
  mediaType: 'movie' | 'episode'
  title: string
  seriesTitle?: string
  seasonNumber?: number
  episodeNumber?: number
  year?: number
  progressPct: number
  updatedAt: number
}

export interface Store {
  settings: Settings
  cache: Cache
  sessions: { movies: Session | null; series: Session | null }
  history: HistoryItem[]
  watchedEvents: WatchedEvent[]
  nowPlaying: NowPlayingItem[]
  lastPolledAt: Partial<Record<MediaServerType, number>>
  rules: AutoDeleteRule[]
  deletionQueue: DeletionQueueItem[]
  posterCache: PosterCache
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
