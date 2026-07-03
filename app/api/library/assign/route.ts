export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { enqueueRuleMatches } from '@/lib/deletion-executor'

// POST: add titles to a rule's targets
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    target?: string
    items?: { arrId: number; scopeTitle?: string }[]
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

  const target = body.target as 'movies' | 'series'
  const store = readStore()
  const rule = store.rules.find(r => r.id === body.ruleId)
  if (!rule) return NextResponse.json({ error: 'rule not found' }, { status: 404 })

  const existingKeys = new Set(rule.targets.map(t => `${t.arrId}:${t.arrTarget}`))
  const toAdd = body.items.filter(i => !existingKeys.has(`${i.arrId}:${target}`))

  if (toAdd.length === 0) return NextResponse.json({ added: 0 })

  updateStore(s => {
    const r = s.rules.find(r => r.id === body.ruleId)
    if (!r) return
    for (const item of toAdd) {
      r.targets.push({ arrId: item.arrId, arrTarget: target, scopeTitle: item.scopeTitle })
    }
  })

  const freshStore = readStore()
  const matchedEvents = freshStore.watchedEvents.filter(e => e.matchStatus === 'matched')
  let enqueued = 0
  for (const ev of matchedEvents) {
    const before = readStore().deletionQueue.length
    enqueueRuleMatches(ev)
    const after = readStore().deletionQueue.length
    enqueued += Math.max(0, after - before)
  }

  return NextResponse.json({ added: toAdd.length, enqueued })
}

// DELETE: remove a title from a rule's targets
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    ruleId?: string
    arrId?: number
    arrTarget?: string
  } | null

  if (
    !body ||
    typeof body.ruleId !== 'string' ||
    typeof body.arrId !== 'number' ||
    (body.arrTarget !== 'movies' && body.arrTarget !== 'series')
  ) {
    return NextResponse.json({ error: 'ruleId, arrId, arrTarget required' }, { status: 400 })
  }

  const store = readStore()
  const idx = store.rules.findIndex(r => r.id === body.ruleId)
  if (idx === -1) return NextResponse.json({ error: 'rule not found' }, { status: 404 })

  updateStore(s => {
    const r = s.rules[idx]
    if (!r) return
    r.targets = r.targets.filter(t => !(t.arrId === body.arrId && t.arrTarget === body.arrTarget))
  })

  return NextResponse.json({ ok: true })
}
