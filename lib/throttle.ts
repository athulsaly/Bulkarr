export async function throttledBatch<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  { concurrency = 3, delayMs = 300 }: { concurrency?: number; delayMs?: number } = {}
): Promise<R[]> {
  if (!items.length) return []
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  let nextDispatchAllowedAt = 0

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      // Schedule this dispatch: read + write nextDispatchAllowedAt synchronously
      // (before any await) so JS single-thread guarantees no interleaving.
      const scheduledAt = Math.max(Date.now(), nextDispatchAllowedAt)
      if (delayMs > 0) nextDispatchAllowedAt = scheduledAt + delayMs
      const wait = scheduledAt - Date.now()
      if (wait > 0) await new Promise<void>(r => setTimeout(r, wait))
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}
