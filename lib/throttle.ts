export async function throttledBatch<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  { concurrency = 3, delayMs = 300 }: { concurrency?: number; delayMs?: number } = {}
): Promise<R[]> {
  if (!items.length) return []
  const results: R[] = new Array(items.length)
  let next = 0
  let lastDispatch = 0

  async function worker() {
    while (next < items.length) {
      const i = next++
      if (delayMs > 0) {
        const wait = lastDispatch + delayMs - Date.now()
        if (wait > 0) await new Promise(r => setTimeout(r, wait))
      }
      lastDispatch = Date.now()
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}
