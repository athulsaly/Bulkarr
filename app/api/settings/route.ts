import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { isValidServiceUrl } from '@/lib/validate'
import type { ServiceConfig, Session, MediaServerConfig } from '@/lib/types'

export const runtime = 'nodejs'

function maskKey(k: string): string {
  return k ? '••••••••' : ''
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
      tmdbApiKey: store.settings.tmdbApiKey ? maskKey(store.settings.tmdbApiKey) : '',
      jellyfin: store.settings.jellyfin ? { url: store.settings.jellyfin.url, apiKey: maskKey(store.settings.jellyfin.apiKey) } : null,
      plex: store.settings.plex ? { url: store.settings.plex.url, apiKey: maskKey(store.settings.plex.apiKey) } : null,
      mediaServer: store.settings.mediaServer,
    },
    cache: store.cache,
    sessions: store.sessions,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    radarr?: ServiceConfig
    sonarr?: ServiceConfig
    jellyfin?: ServiceConfig
    plex?: ServiceConfig
    tmdbApiKey?: string
    mediaServer?: MediaServerConfig
    session?: Session | null
    target?: 'movies' | 'series'
  }

  for (const key of ['radarr', 'sonarr', 'jellyfin', 'plex'] as const) {
    if (body[key] !== undefined && body[key] !== null) {
      if (!isValidServiceUrl(body[key]?.url))
        return NextResponse.json({ error: `Invalid ${key} URL — must start with http:// or https://` }, { status: 400 })
    }
  }

  if (body.target !== undefined && !['movies', 'series'].includes(body.target as string))
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  updateStore(s => {
    if (body.radarr !== undefined) {
      if (body.radarr === null) {
        s.settings.radarr = null
      } else {
        const existingKey = s.settings.radarr?.apiKey ?? ''
        s.settings.radarr = { url: body.radarr.url, apiKey: body.radarr.apiKey === '••••••••' ? existingKey : body.radarr.apiKey }
      }
    }
    if (body.sonarr !== undefined) {
      if (body.sonarr === null) {
        s.settings.sonarr = null
      } else {
        const existingKey = s.settings.sonarr?.apiKey ?? ''
        s.settings.sonarr = { url: body.sonarr.url, apiKey: body.sonarr.apiKey === '••••••••' ? existingKey : body.sonarr.apiKey }
      }
    }
    if (body.jellyfin !== undefined) {
      if (body.jellyfin === null) {
        s.settings.jellyfin = null
      } else {
        const existingKey = s.settings.jellyfin?.apiKey ?? ''
        s.settings.jellyfin = { url: body.jellyfin.url, apiKey: body.jellyfin.apiKey === '••••••••' ? existingKey : body.jellyfin.apiKey }
      }
    }
    if (body.plex !== undefined) {
      if (body.plex === null) {
        s.settings.plex = null
      } else {
        const existingKey = s.settings.plex?.apiKey ?? ''
        s.settings.plex = { url: body.plex.url, apiKey: body.plex.apiKey === '••••••••' ? existingKey : body.plex.apiKey }
      }
    }
    if (body.tmdbApiKey !== undefined) s.settings.tmdbApiKey = body.tmdbApiKey || undefined
    if (body.mediaServer !== undefined) s.settings.mediaServer = { ...s.settings.mediaServer, ...body.mediaServer }
    if (body.target && body.session !== undefined) s.sessions[body.target] = body.session
  })
  return NextResponse.json({ ok: true })
}
