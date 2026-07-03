export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { evaluateRules } from '@/lib/rule-engine'
import { runExecutorCycle } from '@/lib/deletion-executor'

const MAX_QUEUE = 500

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
  const targetedIds: string[] = []

  if (newItems.length) {
    updateStore(s => {
      const now = Date.now()
      s.deletionQueue.push(...newItems)
      for (const item of newItems) {
        const qi = s.deletionQueue.find(q => q.id === item.id)
        if (qi) { qi.scheduledAt = now; targetedIds.push(qi.id) }
      }
      if (s.deletionQueue.length > MAX_QUEUE) {
        const pending = s.deletionQueue.filter(i => i.status === 'pending')
        const terminal = s.deletionQueue.filter(i => i.status !== 'pending')
        s.deletionQueue = [...pending, ...terminal].slice(0, MAX_QUEUE)
      }
    })
  } else {
    // Force existing pending items for this event as due now
    const existingPending = store.deletionQueue.filter(
      q => q.watchedEventId === watchedEventId && q.status === 'pending'
    )
    if (!existingPending.length) {
      // No rules matched and no existing pending items — true noop
      return NextResponse.json({ executed: 0, failed: 0 })
    }
    updateStore(s => {
      const now = Date.now()
      for (const qi of s.deletionQueue) {
        if (qi.watchedEventId === watchedEventId && qi.status === 'pending') {
          qi.scheduledAt = now
          targetedIds.push(qi.id)
        }
      }
    })
  }

  try {
    await runExecutorCycle()
    // Report per-event outcome, not global count
    const freshQueue = readStore().deletionQueue
    const eventExecuted = targetedIds.filter(id =>
      freshQueue.find(q => q.id === id)?.status === 'done'
    ).length
    const eventFailed = targetedIds.filter(id =>
      freshQueue.find(q => q.id === id)?.status === 'failed'
    ).length
    return NextResponse.json({ executed: eventExecuted, failed: eventFailed })
  } catch (e) {
    return NextResponse.json({ executed: 0, failed: 0, errorMessage: e instanceof Error ? e.message : String(e) })
  }
}
