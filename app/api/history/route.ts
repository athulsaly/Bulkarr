import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const target = new URL(req.url).searchParams.get('target') as 'movies' | 'series' | null
  const history = readStore().history
  return NextResponse.json({ history: target ? history.filter(h => h.target === target) : history })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { id?: string }
  updateStore(s => { s.history = body.id ? s.history.filter(h => h.id !== body.id) : [] })
  return NextResponse.json({ ok: true })
}
