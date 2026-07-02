import { readStore, updateStore } from './store'
import { evaluateRules } from './rule-engine'
import {
  deleteMovie, unmonitorMovie,
  deleteEpisodeFile, deleteSeasonFiles,
  unmonitorEpisode, unmonitorSeason,
  getSeasonEpisodeFileCount,
} from './arr-client'
import type { DeletionQueueItem, Store, WatchedEvent } from './types'

const MAX_QUEUE = 500
const EXECUTOR_INTERVAL_MS = 5 * 60 * 1000
const RESCHEDULE_DELAY_MS = 24 * 60 * 60 * 1000
const MAX_RETRIES = 3

async function executeItem(item: DeletionQueueItem, store: Store): Promise<void> {
  const settings = item.arrTarget === 'movies' ? store.settings.radarr : store.settings.sonarr
  if (!settings) throw new Error(`${item.arrTarget === 'movies' ? 'Radarr' : 'Sonarr'} not configured`)
  const { url, apiKey } = settings
  const { granularity, action, arrId, deleteFiles } = item
  const sn = item.seasonNumber!
  const en = item.episodeNumber!

  if (granularity === 'movie' && action === 'delete') {
    await deleteMovie(url, apiKey, arrId, deleteFiles)
  } else if (granularity === 'movie' && action === 'unmonitor') {
    await unmonitorMovie(url, apiKey, arrId)
  } else if (granularity === 'episode' && action === 'delete') {
    await deleteEpisodeFile(url, apiKey, arrId, sn, en)
  } else if (granularity === 'episode' && action === 'unmonitor') {
    await unmonitorEpisode(url, apiKey, arrId, sn, en)
  } else if (granularity === 'season' && action === 'delete') {
    await deleteSeasonFiles(url, apiKey, arrId, sn)
  } else if (granularity === 'season' && action === 'unmonitor') {
    await unmonitorSeason(url, apiKey, arrId, sn)
  }
}

async function shouldRescheduleSeasonItem(item: DeletionQueueItem, store: Store): Promise<boolean> {
  if (item.granularity !== 'season' || item.seasonNumber == null) return false
  const settings = store.settings.sonarr
  if (!settings) return false

  const watchedEpNums = new Set(
    store.watchedEvents
      .filter(e =>
        e.arrId === item.arrId &&
        e.seasonNumber === item.seasonNumber &&
        e.matchStatus === 'matched' &&
        e.episodeNumber != null,
      )
      .map(e => e.episodeNumber as number),
  )

  const downloadedCount = await getSeasonEpisodeFileCount(
    settings.url, settings.apiKey, item.arrId, item.seasonNumber,
  )

  return watchedEpNums.size < downloadedCount
}

export async function runExecutorCycle(): Promise<{ executed: number; failed: number }> {
  const now = Date.now()
  const store = readStore()
  const due = store.deletionQueue.filter(i => i.status === 'pending' && i.scheduledAt <= now)

  let executed = 0
  let failed = 0

  for (const item of due) {
    try {
      const reschedule = await shouldRescheduleSeasonItem(item, store)
      if (reschedule) {
        updateStore(s => {
          const qi = s.deletionQueue.find(q => q.id === item.id)
          if (qi) qi.scheduledAt = now + RESCHEDULE_DELAY_MS
        })
        continue
      }

      await executeItem(item, store)

      updateStore(s => {
        const qi = s.deletionQueue.find(q => q.id === item.id)
        if (qi) { qi.status = 'done'; qi.executedAt = Date.now() }
      })
      executed++
    } catch (e) {
      updateStore(s => {
        const qi = s.deletionQueue.find(q => q.id === item.id)
        if (!qi) return
        qi.retryCount++
        if (qi.retryCount >= MAX_RETRIES) {
          qi.status = 'failed'
          qi.errorMessage = (e as Error).message
        }
      })
      failed++
    }
  }

  return { executed, failed }
}

export function startDeletionExecutor(): void {
  async function tick(): Promise<void> {
    await runExecutorCycle()
    setTimeout(() => { tick().catch(e => console.error('[bulkarr] executor tick error:', e)) }, EXECUTOR_INTERVAL_MS)
  }
  tick().catch(e => console.error('[bulkarr] executor startup error:', e))
}

export function enqueueRuleMatches(event: WatchedEvent): void {
  if (!event.arrId || event.matchStatus !== 'matched') return
  const store = readStore()
  const newItems = evaluateRules(event, store.rules, store.deletionQueue, store.watchedEvents)
  if (!newItems.length) return
  updateStore(s => {
    s.deletionQueue.push(...newItems)
    if (s.deletionQueue.length > MAX_QUEUE) {
      const pending = s.deletionQueue.filter(i => i.status === 'pending')
      const terminal = s.deletionQueue.filter(i => i.status !== 'pending')
      s.deletionQueue = [...pending, ...terminal].slice(0, MAX_QUEUE)
    }
  })
}
