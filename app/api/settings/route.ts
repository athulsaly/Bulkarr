import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import type { ServiceConfig, Session } from '@/lib/types'

export const runtime = 'nodejs'

function maskKey(k: string): string {
  if (!k) return ''
  return k.length <= 8 ? '••••••••' : `${k.slice(0, 4)}${'•'.repeat(k.length - 4)}`
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
  updateStore(s => {
    if (body.radarr !== undefined) s.settings.radarr = body.radarr ?? null
    if (body.sonarr !== undefined) s.settings.sonarr = body.sonarr ?? null
    if (body.target && body.session !== undefined) s.sessions[body.target] = body.session
  })
  return NextResponse.json({ ok: true })
}
