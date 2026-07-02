export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startMediaPoller } = await import('./lib/media-poller')
    const { startDeletionExecutor } = await import('./lib/deletion-executor')
    startMediaPoller()
    startDeletionExecutor()
  }
}
