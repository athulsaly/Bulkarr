import type { AutoDeleteRule, RuleTarget } from '@/lib/types'

export const VALID_DELAY_UNITS = ['days', 'weeks', 'months', 'year'] as const

export function validateRule(body: Partial<AutoDeleteRule>): string | null {
  if (!body.name || typeof body.name !== 'string') return 'name required'
  if (body.mediaType !== 'movie' && body.mediaType !== 'series') return 'invalid mediaType'
  if (!['movie', 'episode', 'season'].includes(body.granularity ?? '')) return 'invalid granularity'
  if (!['delete', 'unmonitor'].includes(body.action ?? '')) return 'invalid action'
  if (typeof body.delayAmount !== 'number' || body.delayAmount < 1) return 'delayAmount must be >= 1'
  if (!VALID_DELAY_UNITS.includes(body.delayUnit as typeof VALID_DELAY_UNITS[number])) return 'invalid delayUnit'
  if (!Array.isArray(body.targets)) return 'targets must be an array'
  for (const t of body.targets as RuleTarget[]) {
    if (typeof t.arrId !== 'number') return 'each target must have a numeric arrId'
    if (t.arrTarget !== 'movies' && t.arrTarget !== 'series') return 'each target must have arrTarget "movies" or "series"'
  }
  if (body.mediaType === 'movie' && body.granularity !== 'movie') return 'movie mediaType requires granularity=movie'
  if (body.mediaType === 'series' && body.granularity === 'movie') return 'series mediaType cannot use granularity=movie'
  return null
}
