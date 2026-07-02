export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startMediaPoller } = await import('./lib/media-poller')
    startMediaPoller()
  }
}
