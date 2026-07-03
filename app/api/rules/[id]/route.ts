export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { enqueueRuleMatches } from '@/lib/deletion-executor'
import { validateRule } from '@/lib/rule-validation'
import type { AutoDeleteRule } from '@/lib/types'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const store = readStore()
  const rule = store.rules.find(r => r.id === id)
  if (!rule) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ rule })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => null) as Partial<AutoDeleteRule> | null
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })

  const err = validateRule(body)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const store = readStore()
  const idx = store.rules.findIndex(r => r.id === id)
  if (idx === -1) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const updated: AutoDeleteRule = {
    id,
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

  updateStore(s => { s.rules[idx] = updated })

  // Cancel pending queue items when rule is disabled
  if (!updated.enabled) {
    updateStore(s => {
      for (const qi of s.deletionQueue) {
        if (qi.ruleId === id && qi.status === 'pending') qi.status = 'cancelled'
      }
    })
  }

  const matchedEvents = readStore().watchedEvents.filter(e => e.matchStatus === 'matched')
  let enqueued = 0
  for (const ev of matchedEvents) {
    const before = readStore().deletionQueue.length
    enqueueRuleMatches(ev)
    const after = readStore().deletionQueue.length
    enqueued += Math.max(0, after - before)
  }

  return NextResponse.json({ rule: updated, enqueued })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const store = readStore()
  const idx = store.rules.findIndex(r => r.id === id)
  if (idx === -1) return NextResponse.json({ error: 'not found' }, { status: 404 })

  updateStore(s => {
    s.rules.splice(idx, 1)
    for (const qi of s.deletionQueue) {
      if (qi.ruleId === id && qi.status === 'pending') qi.status = 'cancelled'
    }
  })

  return NextResponse.json({ ok: true })
}
