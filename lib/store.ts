import fs from 'fs'
import path from 'path'
import type { Store } from './types'

const DEFAULT_STORE: Store = {
  settings: { radarr: null, sonarr: null },
  cache: { radarr: null, sonarr: null },
  sessions: { movies: null, series: null },
  history: [],
}

function getStorePath(): string {
  return path.join(process.env.DATA_DIR ?? './data', 'store.json')
}

export function readStore(): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(getStorePath(), 'utf-8')) as Partial<Store>
    const store = structuredClone(DEFAULT_STORE)
    if (raw.settings) Object.assign(store.settings, raw.settings)
    if (raw.cache) Object.assign(store.cache, raw.cache)
    if (raw.sessions) Object.assign(store.sessions, raw.sessions)
    if (Array.isArray(raw.history)) store.history = raw.history
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
