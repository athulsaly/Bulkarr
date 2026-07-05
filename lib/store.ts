import fs from 'fs'
import path from 'path'
import type { Store, MediaServerConfig, Settings, AutoDeleteRule, DeletionQueueItem } from './types'

const DEFAULT_STORE: Store = {
  settings: {
    radarr: null,
    sonarr: null,
    jellyfin: null,
    plex: null,
    mediaServer: { pollIntervalMinutes: 15, watchedThresholdPct: 90 },
  },
  cache: { radarr: null, sonarr: null },
  sessions: { movies: null, series: null },
  history: [],
  watchedEvents: [],
  nowPlaying: [],
  lastPolledAt: {},
  rules: [],
  deletionQueue: [],
  posterCache: { movies: {}, series: {} },
}

function getStorePath(): string {
  return path.join(process.env.DATA_DIR ?? './data', 'store.json')
}

export function readStore(): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(getStorePath(), 'utf-8')) as Partial<Store>
    const store = structuredClone(DEFAULT_STORE)
    if (raw.settings) {
      const { mediaServer, ...restSettings } = raw.settings as Partial<Settings> & { mediaServer?: Partial<MediaServerConfig> }
      Object.assign(store.settings, restSettings)
      if (mediaServer && typeof mediaServer === 'object') {
        store.settings.mediaServer = { ...DEFAULT_STORE.settings.mediaServer, ...mediaServer }
      }
    }
    if (raw.cache) Object.assign(store.cache, raw.cache)
    if (raw.sessions) Object.assign(store.sessions, raw.sessions)
    if (Array.isArray(raw.history)) store.history = raw.history
    if (Array.isArray(raw.watchedEvents)) {
      store.watchedEvents = (raw.watchedEvents as typeof store.watchedEvents)
        .sort((a, b) => b.watchedAt - a.watchedAt)
        .slice(0, 1000)
    }
    if (raw.lastPolledAt && typeof raw.lastPolledAt === 'object') {
      Object.assign(store.lastPolledAt, raw.lastPolledAt)
    }
    if (Array.isArray(raw.rules)) {
      store.rules = (raw.rules as unknown as Array<Record<string, unknown>>).map(r => {
        if ('scope' in r && !('targets' in r)) {
          const { scope, arrId, arrTarget, scopeTitle, ...rest } = r
          const targets = (scope === 'specific' && arrId != null)
            ? [{ arrId, arrTarget, scopeTitle }]
            : []
          return { ...rest, targets } as unknown as AutoDeleteRule
        }
        return r as unknown as AutoDeleteRule
      })
    }
    if (Array.isArray(raw.deletionQueue)) {
      const rawQueue = raw.deletionQueue as DeletionQueueItem[]
      const pending = rawQueue.filter(i => i.status === 'pending')
      const terminal = rawQueue.filter(i => i.status !== 'pending')
      store.deletionQueue = [...pending, ...terminal].slice(0, 500)
    }
    if (raw.posterCache && typeof raw.posterCache === 'object') {
      const pc = raw.posterCache as Partial<Store['posterCache']>
      if (pc.movies && typeof pc.movies === 'object') store.posterCache.movies = pc.movies
      if (pc.series && typeof pc.series === 'object') store.posterCache.series = pc.series
    }
    return store
  } catch {
    return structuredClone(DEFAULT_STORE)
  }
}

export function writeStore(store: Store): void {
  const p = getStorePath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf-8')
}

export function updateStore(updater: (store: Store) => void): Store {
  const store = readStore()
  updater(store)
  writeStore(store)
  return store
}
