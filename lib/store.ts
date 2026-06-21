import fs from 'fs'
import path from 'path'
import type { Store } from './types'

const DEFAULT_STORE: Store = {
  settings: { radarr: null, sonarr: null },
  cache: { radarr: null, sonarr: null },
  sessions: { movies: null, series: null },
}

function getStorePath(): string {
  return path.join(process.env.DATA_DIR ?? './data', 'store.json')
}

export function readStore(): Store {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8')
    return { ...structuredClone(DEFAULT_STORE), ...JSON.parse(raw) }
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
