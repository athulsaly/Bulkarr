import type { AutoDeleteRule } from '@/lib/types'

export const VALID_DELAY_UNITS = ['days', 'weeks', 'months', 'year'] as const

export function validateRule(body: Partial<AutoDeleteRule>): string | null {
  if (!body.name || typeof body.name !== 'string') return 'name required'
  if (body.mediaType !== 'movie' && body.mediaType !== 'series') return 'invalid mediaType'
  if (!['movie', 'episode', 'season'].includes(body.granularity ?? '')) return 'invalid granularity'
  if (!['delete', 'unmonitor'].includes(body.action ?? '')) return 'invalid action'
  if (typeof body.delayAmount !== 'number' || body.delayAmount < 1) return 'delayAmount must be >= 1'
  if (!VALID_DELAY_UNITS.includes(body.delayUnit as typeof VALID_DELAY_UNITS[number])) return 'invalid delayUnit'
  if (body.scope !== 'global' && body.scope !== 'specific') return 'invalid scope'
  if (body.scope === 'specific' && (body.arrId == null || !body.arrTarget)) return 'specific scope requires arrId and arrTarget'
  if (body.mediaType === 'movie' && body.granularity !== 'movie') return 'movie mediaType requires granularity=movie'
  if (body.mediaType === 'series' && body.granularity === 'movie') return 'series mediaType cannot use granularity=movie'
  return null
}
