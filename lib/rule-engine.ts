import { v4 as uuidv4 } from 'uuid'
import type { AutoDeleteRule, DeletionQueueItem, WatchedEvent } from '@/lib/types'

export function delayToMs(amount: number, unit: 'days' | 'weeks' | 'months' | 'year'): number {
  const DAY = 86_400_000
  switch (unit) {
    case 'days':   return amount * DAY
    case 'weeks':  return amount * 7 * DAY
    case 'months': return amount * 30 * DAY
    case 'year':   return 365 * DAY
  }
}

function isDupInQueue(
  queue: DeletionQueueItem[],
  ruleId: string,
  arrId: number,
  seasonNumber: number | undefined,
  episodeNumber: number | undefined,
): boolean {
  return queue.some(q =>
    q.ruleId === ruleId &&
    q.arrId === arrId &&
    q.seasonNumber === seasonNumber &&
    q.episodeNumber === episodeNumber &&
    q.status !== 'cancelled',
  )
}

export function evaluateRules(
  event: WatchedEvent,
  rules: AutoDeleteRule[],
  existingQueue: DeletionQueueItem[],
  watchedEvents: WatchedEvent[],
): DeletionQueueItem[] {
  if (!event.arrId || event.matchStatus !== 'matched') return []

  const eventMediaType = event.mediaType === 'movie' ? 'movie' : 'series'

  // Rules that are enabled, match mediaType, and have this arrId in their targets
  const applicable = rules.filter(r =>
    r.enabled &&
    r.mediaType === eventMediaType &&
    r.targets.some(t => t.arrId === event.arrId),
  )

  const items: DeletionQueueItem[] = []

  for (const rule of applicable) {
    const { granularity } = rule

    if (granularity === 'movie' || granularity === 'episode') {
      if (isDupInQueue(existingQueue, rule.id, event.arrId, event.seasonNumber, event.episodeNumber)) continue

      const scheduledAt = event.watchedAt + delayToMs(rule.delayAmount, rule.delayUnit)
      items.push({
        id: uuidv4(),
        ruleId: rule.id,
        ruleName: rule.name,
        watchedEventId: event.id,
        arrId: event.arrId,
        arrTarget: event.arrTarget ?? (eventMediaType === 'movie' ? 'movies' : 'series'),
        action: rule.action,
        deleteFiles: rule.deleteFiles,
        granularity,
        title: event.title,
        seriesTitle: event.seriesTitle,
        seasonNumber: event.seasonNumber,
        episodeNumber: event.episodeNumber,
        scheduledAt,
        status: 'pending',
        retryCount: 0,
      })
    } else if (granularity === 'season') {
      if (event.mediaType !== 'episode' || event.seasonNumber == null) continue
      if (isDupInQueue(existingQueue, rule.id, event.arrId, event.seasonNumber, undefined)) continue

      const seasonEvents = watchedEvents.filter(e =>
        e.arrId === event.arrId &&
        e.seasonNumber === event.seasonNumber &&
        e.matchStatus === 'matched',
      )
      const maxWatchedAt = seasonEvents.reduce((m, e) => Math.max(m, e.watchedAt), event.watchedAt)
      const scheduledAt = maxWatchedAt + delayToMs(rule.delayAmount, rule.delayUnit)

      items.push({
        id: uuidv4(),
        ruleId: rule.id,
        ruleName: rule.name,
        watchedEventId: event.id,
        arrId: event.arrId,
        arrTarget: event.arrTarget ?? 'series',
        action: rule.action,
        deleteFiles: rule.deleteFiles,
        granularity: 'season',
        title: event.seriesTitle ?? event.title,
        seriesTitle: event.seriesTitle,
        seasonNumber: event.seasonNumber,
        scheduledAt,
        status: 'pending',
        retryCount: 0,
      })
    }
  }

  return items
}
