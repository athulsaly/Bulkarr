import { NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { matchWatchedEvent } from '@/lib/media-matcher'

export const runtime = 'nodejs'

export async function POST() {
  const store = readStore()
  const cache = { radarr: store.cache.radarr, sonarr: store.cache.sonarr }
  let updated = 0

  updateStore(s => {
    for (const ev of s.watchedEvents) {
      if (ev.matchStatus === 'matched') continue
      const match = matchWatchedEvent(ev, cache)
      if (match.matchStatus !== ev.matchStatus || match.arrId !== ev.arrId) {
        Object.assign(ev, match)
        updated++
      }
    }
  })

  return NextResponse.json({ updated })
}
