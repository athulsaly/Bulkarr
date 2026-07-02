import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'

export const runtime = 'nodejs'

export async function GET() {
  const store = readStore()
  return NextResponse.json({ events: store.watchedEvents, lastPolledAt: store.lastPolledAt })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json().catch(() => ({})) as { id?: string }
  updateStore(s => {
    s.watchedEvents = id ? s.watchedEvents.filter(e => e.id !== id) : []
  })
  return NextResponse.json({ ok: true })
}
