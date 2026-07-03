export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { readStore, updateStore } from '@/lib/store'
import { enqueueRuleMatches } from '@/lib/deletion-executor'
import { validateRule } from '@/lib/rule-validation'
import type { AutoDeleteRule } from '@/lib/types'

export async function GET() {
  const store = readStore()
  return NextResponse.json({ rules: store.rules })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Partial<AutoDeleteRule> | null
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })

  const err = validateRule(body)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const rule: AutoDeleteRule = {
    id: uuidv4(),
    name: body.name!,
    enabled: body.enabled ?? true,
    mediaType: body.mediaType!,
    granularity: body.granularity!,
    action: body.action!,
    deleteFiles: body.deleteFiles ?? false,
    delayAmount: body.delayAmount!,
    delayUnit: body.delayUnit!,
    scope: body.scope!,
    arrId: body.arrId,
    arrTarget: body.arrTarget,
    scopeTitle: body.scopeTitle,
  }

  updateStore(s => { s.rules.push(rule) })

  // Enqueue matches from existing matched watched events
  const store = readStore()
  const matchedEvents = store.watchedEvents.filter(e => e.matchStatus === 'matched')
  let enqueued = 0
  for (const ev of matchedEvents) {
    const before = readStore().deletionQueue.length
    enqueueRuleMatches(ev)
    const after = readStore().deletionQueue.length
    enqueued += Math.max(0, after - before)
  }

  return NextResponse.json({ rule, enqueued }, { status: 201 })
}
