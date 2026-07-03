export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { evaluateRules } from '@/lib/rule-engine'

export async function POST(_req: NextRequest) {
  const store = readStore()
  const matchedEvents = store.watchedEvents.filter(e => e.matchStatus === 'matched')
  let enqueued = 0

  for (const ev of matchedEvents) {
    const currentQueue = readStore().deletionQueue
    const newItems = evaluateRules(ev, store.rules, currentQueue, store.watchedEvents)
    if (newItems.length) {
      updateStore(s => { s.deletionQueue.push(...newItems) })
      enqueued += newItems.length
    }
  }

  return NextResponse.json({ enqueued })
}
