export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const store = readStore()
  const item = store.deletionQueue.find(i => i.id === id)
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: 'item is not pending' }, { status: 400 })

  updateStore(s => {
    const qi = s.deletionQueue.find(i => i.id === id)
    if (qi) qi.status = 'cancelled'
  })
  return NextResponse.json({ ok: true })
}
