export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import type { DeletionQueueStatus, DeletionQueueItem, AutoDeleteRule } from '@/lib/types'

const VALID_STATUSES: DeletionQueueStatus[] = ['pending', 'done', 'failed', 'cancelled']

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') as DeletionQueueStatus | null
  const store = readStore()
  const items = status && VALID_STATUSES.includes(status)
    ? store.deletionQueue.filter(i => i.status === status)
    : store.deletionQueue
  return NextResponse.json({ items })
}

const DELAY_MS: Record<AutoDeleteRule['delayUnit'], number> = {
  days: 86_400_000,
  weeks: 604_800_000,
  months: 2_592_000_000,
  year: 31_536_000_000,
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { watchedEventId?: string; ruleId?: string }
  const { watchedEventId, ruleId } = body
  if (!watchedEventId || !ruleId) {
    return NextResponse.json({ error: 'watchedEventId and ruleId required' }, { status: 400 })
  }

  const store = readStore()

  const event = store.watchedEvents.find(e => e.id === watchedEventId)
  if (!event) return NextResponse.json({ error: 'watched event not found' }, { status: 404 })

  const rule = store.rules.find(r => r.id === ruleId)
  if (!rule) return NextResponse.json({ error: 'rule not found' }, { status: 404 })

  if (event.matchStatus !== 'matched') {
    return NextResponse.json({ error: 'event is not matched' }, { status: 400 })
  }
  if (!rule.enabled) {
    return NextResponse.json({ error: 'rule is not enabled' }, { status: 400 })
  }
  if (event.arrId == null || event.arrTarget == null) {
    return NextResponse.json({ error: 'event has no arr link' }, { status: 400 })
  }

  const scheduledAt = Date.now() + rule.delayAmount * DELAY_MS[rule.delayUnit]

  const item: DeletionQueueItem = {
    id: crypto.randomUUID(),
    ruleId: rule.id,
    ruleName: rule.name,
    watchedEventId: event.id,
    arrId: event.arrId,
    arrTarget: event.arrTarget,
    action: rule.action,
    deleteFiles: rule.deleteFiles,
    granularity: rule.granularity,
    title: event.mediaType === 'episode' ? (event.seriesTitle ?? event.title) : event.title,
    seriesTitle: event.seriesTitle,
    seasonNumber: event.seasonNumber,
    episodeNumber: event.episodeNumber,
    scheduledAt,
    status: 'pending',
    retryCount: 0,
  }

  updateStore(s => { s.deletionQueue.push(item) })
  return NextResponse.json({ ok: true, item })
}
