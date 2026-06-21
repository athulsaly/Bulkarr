// @jest-environment node

import { throttledBatch } from '@/lib/throttle'

test('returns results in input order', async () => {
  const results = await throttledBatch([1, 2, 3], async n => n * 2, { concurrency: 2, delayMs: 0 })
  expect(results).toEqual([2, 4, 6])
})

test('respects concurrency limit', async () => {
  let active = 0; let peak = 0
  await throttledBatch(
    Array.from({ length: 6 }),
    async () => {
      active++; peak = Math.max(peak, active)
      await new Promise(r => setTimeout(r, 5))
      active--
    },
    { concurrency: 3, delayMs: 0 }
  )
  expect(peak).toBeLessThanOrEqual(3)
})

test('handles empty array', async () => {
  expect(await throttledBatch([], async x => x, { delayMs: 0 })).toEqual([])
})
