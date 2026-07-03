export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { readStore, updateStore } from '@/lib/store'
import { enqueueRuleMatches } from '@/lib/deletion-executor'
import type { AutoDeleteRule } from '@/lib/types'

interface AssignItem {
  arrId: number
  scopeTitle?: string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    target?: string
    items?: AssignItem[]
    ruleId?: string
  } | null

  if (
    !body ||
    (body.target !== 'movies' && body.target !== 'series') ||
    !Array.isArray(body.items) || !body.items.length ||
    typeof body.ruleId !== 'string'
  ) {
    return NextResponse.json({ error: 'target, items, ruleId required' }, { status: 400 })
  }

  const store = readStore()
  const template = store.rules.find(r => r.id === body.ruleId)
  if (!template) {
    return NextResponse.json({ error: 'rule not found' }, { status: 404 })
  }

  const target = body.target as 'movies' | 'series'
  const created: AutoDeleteRule[] = []

  for (const { arrId, scopeTitle } of body.items) {
    const alreadyExists = store.rules.some(r =>
      r.scope === 'specific' &&
      r.arrId === arrId &&
      r.arrTarget === target &&
      r.name === template.name
    )
    if (alreadyExists) continue

    created.push({
      id: uuidv4(),
      name: template.name,
      enabled: template.enabled,
      mediaType: template.mediaType,
      granularity: template.granularity,
      action: template.action,
      deleteFiles: template.deleteFiles,
      delayAmount: template.delayAmount,
      delayUnit: template.delayUnit,
      scope: 'specific',
      arrId,
      arrTarget: target,
      scopeTitle,
    })
  }

  if (created.length) {
    updateStore(s => { s.rules.push(...created) })

    const freshStore = readStore()
    const matchedEvents = freshStore.watchedEvents.filter(e => e.matchStatus === 'matched')
    let enqueued = 0
    for (const ev of matchedEvents) {
      const before = readStore().deletionQueue.length
      enqueueRuleMatches(ev)
      const after = readStore().deletionQueue.length
      enqueued += Math.max(0, after - before)
    }
    return NextResponse.json({ created, enqueued })
  }

  return NextResponse.json({ created: [], enqueued: 0 })
}
