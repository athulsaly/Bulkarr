export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { evaluateRules } from '@/lib/rule-engine'
import { runExecutorCycle } from '@/lib/deletion-executor'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { watchedEventId?: string } | null
  const watchedEventId = body?.watchedEventId
  if (!watchedEventId) return NextResponse.json({ error: 'watchedEventId required' }, { status: 400 })

  const store = readStore()
  const event = store.watchedEvents.find(e => e.id === watchedEventId)
  if (!event) return NextResponse.json({ error: 'event not found' }, { status: 404 })
  if (event.matchStatus !== 'matched' || !event.arrId) {
    return NextResponse.json({ error: 'event is not matched' }, { status: 400 })
  }

  const newItems = evaluateRules(event, store.rules, store.deletionQueue, store.watchedEvents)
  if (newItems.length) {
    updateStore(s => {
      s.deletionQueue.push(...newItems)
      const now = Date.now()
      for (const item of newItems) {
        const qi = s.deletionQueue.find(q => q.id === item.id)
        if (qi) qi.scheduledAt = now
      }
    })
  } else {
    updateStore(s => {
      const now = Date.now()
      for (const qi of s.deletionQueue) {
        if (qi.watchedEventId === watchedEventId && qi.status === 'pending') qi.scheduledAt = now
      }
    })
  }

  try {
    const result = await runExecutorCycle()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ executed: 0, errorMessage: e instanceof Error ? e.message : String(e) })
  }
}
