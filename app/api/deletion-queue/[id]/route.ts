export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const store = readStore()
  const item = store.deletionQueue.find(i => i.id === id)
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })

  updateStore(s => {
    const idx = s.deletionQueue.findIndex(i => i.id === id)
    if (idx === -1) return
    if (s.deletionQueue[idx].status === 'pending') {
      s.deletionQueue[idx].status = 'cancelled'
    } else {
      s.deletionQueue.splice(idx, 1)
    }
  })
  return NextResponse.json({ ok: true })
}
