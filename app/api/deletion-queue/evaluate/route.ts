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
      updateStore(s => {
        s.deletionQueue.push(...newItems)
        if (s.deletionQueue.length > 500) {
          const pending = s.deletionQueue.filter(i => i.status === 'pending')
          const terminal = s.deletionQueue.filter(i => i.status !== 'pending')
          s.deletionQueue = [...pending, ...terminal].slice(0, 500)
        }
      })
      enqueued += newItems.length
    }
  }
  return NextResponse.json({ enqueued })
}
