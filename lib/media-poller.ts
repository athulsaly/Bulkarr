import { readStore, updateStore } from './store'
import { fetchJellyfinHistory, fetchPlexHistory } from './media-client'
import { isDuplicate } from './media-dedup'
import { matchWatchedEvent } from './media-matcher'
import { enqueueRuleMatches } from './deletion-executor'
import type { WatchedEvent, MediaServerType } from './types'

const MAX_EVENTS = 1000
const DAY_MS = 24 * 60 * 60 * 1000

async function pollOne(type: MediaServerType, since: number): Promise<WatchedEvent[] | null> {
  const store = readStore()
  const cfg = store.settings[type]
  if (!cfg) return null  // not configured
  const threshold = store.settings.mediaServer.watchedThresholdPct
  try {
    if (type === 'jellyfin') return await fetchJellyfinHistory(cfg.url, cfg.apiKey, since, threshold)
    return await fetchPlexHistory(cfg.url, cfg.apiKey, since, threshold)
  } catch (e) {
    console.error(`[bulkarr] ${type} poll error:`, (e as Error).message)
    return []
  }
}

async function runPoll(): Promise<void> {
  const store = readStore()
  const cache = { radarr: store.cache.radarr, sonarr: store.cache.sonarr }
  const now = Date.now()

  for (const type of ['jellyfin', 'plex'] as const) {
    const since = store.lastPolledAt[type] ?? now - DAY_MS
    const events = await pollOne(type, since)
    if (events === null) continue  // not configured — do NOT advance lastPolledAt
    if (!events.length) {
      updateStore(s => { s.lastPolledAt[type] = now })
      continue
    }
    const newEvents: WatchedEvent[] = []
    updateStore(s => {
      for (const ev of events) {
        if (isDuplicate(ev, s.watchedEvents)) continue
        const match = matchWatchedEvent(ev, cache)
        const stored = { ...ev, ...match }
        s.watchedEvents.unshift(stored)
        newEvents.push(stored)
      }
      if (s.watchedEvents.length > MAX_EVENTS) s.watchedEvents = s.watchedEvents.slice(0, MAX_EVENTS)
      s.lastPolledAt[type] = now
    })
    for (const ev of newEvents) enqueueRuleMatches(ev)
  }
}

export function startMediaPoller(): void {
  async function tick(): Promise<void> {
    await runPoll()
    const intervalMs = (readStore().settings.mediaServer.pollIntervalMinutes ?? 15) * 60_000
    setTimeout(() => { tick().catch(e => console.error('[bulkarr] poll tick error:', e)) }, intervalMs)
  }
  tick().catch(e => console.error('[bulkarr] poller startup error:', e))
}
