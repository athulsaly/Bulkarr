export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { evaluateRules } from '@/lib/rule-engine'
import type { AutoDeleteRule } from '@/lib/types'

const VALID_DELAY_UNITS = ['days', 'weeks', 'months', 'year'] as const

function validate(body: Partial<AutoDeleteRule>): string | null {
  if (!body.name || typeof body.name !== 'string') return 'name required'
  if (body.mediaType !== 'movie' && body.mediaType !== 'series') return 'invalid mediaType'
  if (!['movie', 'episode', 'season'].includes(body.granularity ?? '')) return 'invalid granularity'
  if (!['delete', 'unmonitor'].includes(body.action ?? '')) return 'invalid action'
  if (typeof body.delayAmount !== 'number' || body.delayAmount < 1) return 'delayAmount must be >= 1'
  if (!VALID_DELAY_UNITS.includes(body.delayUnit as typeof VALID_DELAY_UNITS[number])) return 'invalid delayUnit'
  if (body.scope !== 'global' && body.scope !== 'specific') return 'invalid scope'
  if (body.scope === 'specific' && (body.arrId == null || !body.arrTarget)) return 'specific scope requires arrId and arrTarget'
  if (body.mediaType === 'movie' && body.granularity !== 'movie') return 'movie mediaType requires granularity=movie'
  if (body.mediaType === 'series' && body.granularity === 'movie') return 'series mediaType cannot use granularity=movie'
  return null
}

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

  const err = validate(body)
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

  const fresh = readStore()
  const matchedEvents = fresh.watchedEvents.filter(e => e.matchStatus === 'matched')
  let enqueued = 0
  for (const ev of matchedEvents) {
    const newItems = evaluateRules(ev, [updated], fresh.deletionQueue, fresh.watchedEvents)
    if (newItems.length) {
      updateStore(s => { s.deletionQueue.push(...newItems) })
      enqueued += newItems.length
    }
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
