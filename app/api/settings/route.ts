import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import type { ServiceConfig, Session } from '@/lib/types'

export const runtime = 'nodejs'

function maskKey(k: string): string {
  return k ? '••••••••' : ''
}

function isValidServiceUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try { return /^https?:\/\/.+/.test(new URL(url).href) } catch { return false }
}

function seedFromEnv(store: ReturnType<typeof readStore>) {
  if (!store.settings.radarr && process.env.RADARR_URL && process.env.RADARR_API_KEY)
    store.settings.radarr = { url: process.env.RADARR_URL, apiKey: process.env.RADARR_API_KEY }
  if (!store.settings.sonarr && process.env.SONARR_URL && process.env.SONARR_API_KEY)
    store.settings.sonarr = { url: process.env.SONARR_URL, apiKey: process.env.SONARR_API_KEY }
}

export async function GET() {
  const store = readStore()
  seedFromEnv(store)
  return NextResponse.json({
    settings: {
      radarr: store.settings.radarr ? { url: store.settings.radarr.url, apiKey: maskKey(store.settings.radarr.apiKey) } : null,
      sonarr: store.settings.sonarr ? { url: store.settings.sonarr.url, apiKey: maskKey(store.settings.sonarr.apiKey) } : null,
    },
    cache: store.cache,
    sessions: store.sessions,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    radarr?: ServiceConfig
    sonarr?: ServiceConfig
    session?: Session | null
    target?: 'movies' | 'series'
  }

  for (const key of ['radarr', 'sonarr'] as const) {
    if (body[key] !== undefined && body[key] !== null) {
      if (!isValidServiceUrl(body[key]?.url))
        return NextResponse.json({ error: `Invalid ${key} URL — must start with http:// or https://` }, { status: 400 })
    }
  }

  if (body.target !== undefined && !['movies', 'series'].includes(body.target as string))
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  updateStore(s => {
    if (body.radarr !== undefined) s.settings.radarr = body.radarr ?? null
    if (body.sonarr !== undefined) s.settings.sonarr = body.sonarr ?? null
    if (body.target && body.session !== undefined) s.sessions[body.target] = body.session
  })
  return NextResponse.json({ ok: true })
}
