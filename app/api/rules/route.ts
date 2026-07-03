export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
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

export async function GET() {
  const store = readStore()
  return NextResponse.json({ rules: store.rules })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Partial<AutoDeleteRule> | null
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })

  const err = validate(body)
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
    const newItems = evaluateRules(ev, [rule], store.deletionQueue, store.watchedEvents)
    if (newItems.length) {
      updateStore(s => { s.deletionQueue.push(...newItems) })
      enqueued += newItems.length
    }
  }

  return NextResponse.json({ rule, enqueued }, { status: 201 })
}
