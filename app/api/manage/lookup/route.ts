import { NextRequest, NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import { getMovieLibrary, getSeriesLibrary, ArrApiError } from '@/lib/arr-client'
import { v4 as uuidv4 } from 'uuid'
import type { ManageRow, LibraryItem } from '@/lib/types'

export const runtime = 'nodejs'

function parseLines(raw: string): string[] {
  return raw.split(/[\n,]+/).map(l => l.trim()).filter(Boolean)
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

function findMatches(term: string, items: LibraryItem[]): LibraryItem[] {
  const n = normalise(term)
  const exact = items.filter(i => normalise(i.title) === n)
  if (exact.length) return exact
  return items.filter(i => normalise(i.title).includes(n) || n.includes(normalise(i.title)))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { target?: string; titles?: string[] } | null
  const target = body?.target
  const rawTitles = body?.titles

  if ((target !== 'movies' && target !== 'series') || !Array.isArray(rawTitles)) {
    return NextResponse.json({ error: 'target and titles required' }, { status: 400 })
  }

  const titles = Array.from(new Set(rawTitles.map(t => t.trim()).filter(Boolean)))
  if (!titles.length) return NextResponse.json({ rows: [] })

  const store = readStore()
  const service = target === 'movies' ? 'radarr' : 'sonarr'
  const config = store.settings[service]
  if (!config) {
    return NextResponse.json({ error: `${service} not configured` }, { status: 400 })
  }

  try {
    const library = target === 'movies'
      ? await getMovieLibrary(config.url, config.apiKey)
      : await getSeriesLibrary(config.url, config.apiKey)

    const rows: ManageRow[] = titles.map(title => {
      const libraryMatches = findMatches(title, library)
      return {
        id: uuidv4(),
        inputText: title,
        libraryMatches,
        selectedIndex: 0,
        action: 'remove' as const,
        status: libraryMatches.length > 0 ? 'matched' : 'no_match',
      }
    })

    return NextResponse.json({ rows })
  } catch (e) {
    if (e instanceof ArrApiError) {
      return NextResponse.json({ error: e.message }, { status: 502 })
    }
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
