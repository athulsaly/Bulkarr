import { NextRequest, NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import { lookupMovies, lookupSeries, ArrApiError } from '@/lib/arr-client'
import { throttledBatch } from '@/lib/throttle'
import type { ArrItem } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { target, terms } = await req.json() as { target: 'movies' | 'series'; terms: string[] }
  const service = target === 'movies' ? 'radarr' : 'sonarr'
  const config = readStore().settings[service]
  if (!config) return NextResponse.json({ error: { code: 'NOT_CONFIGURED', message: `${service} not configured` } }, { status: 400 })

  const fn = target === 'movies' ? lookupMovies : lookupSeries

  const results = await throttledBatch<string, { candidates: ArrItem[]; error?: string }>(
    terms,
    async term => {
      try { return { candidates: await fn(config.url, config.apiKey, term) } }
      catch (e) { return { candidates: [], error: e instanceof ArrApiError ? e.message : 'Lookup failed' } }
    },
    { concurrency: 3, delayMs: 300 }
  )

  return NextResponse.json({ results })
}
