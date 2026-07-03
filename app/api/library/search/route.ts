export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import type { LibraryItem } from '@/lib/types'

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('target') as 'movies' | 'series' | null
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()

  if (target !== 'movies' && target !== 'series') {
    return NextResponse.json({ error: 'target required (movies|series)' }, { status: 400 })
  }

  const store = readStore()
  const library: LibraryItem[] =
    (target === 'movies' ? store.cache.radarr?.library : store.cache.sonarr?.library) ?? []

  const results = q
    ? library.filter(i => i.title.toLowerCase().includes(q)).slice(0, 15)
    : library.slice(0, 15)

  return NextResponse.json({ results })
}
