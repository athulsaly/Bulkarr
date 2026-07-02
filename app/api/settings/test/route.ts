import { NextRequest, NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import { getSystemStatus, ArrApiError } from '@/lib/arr-client'
import { isValidServiceUrl } from '@/lib/validate'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { service, url: inlineUrl, apiKey: inlineKey } = await req.json() as {
    service: string; url?: string; apiKey?: string
  }

  if (inlineUrl !== undefined && !isValidServiceUrl(inlineUrl))
    return NextResponse.json({ ok: false, error: 'Invalid URL — must start with http:// or https://' }, { status: 400 })

  // Jellyfin test
  if (service === 'jellyfin') {
    const stored = readStore().settings.jellyfin
    const config = {
      url: inlineUrl || stored?.url || '',
      apiKey: inlineKey || stored?.apiKey || '',
    }
    if (!config.url || !config.apiKey) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 400 })
    try {
      const res = await fetch(`${config.url.replace(/\/+$/, '')}/Users`, {
        headers: { 'X-Emby-Token': config.apiKey, Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const users = await res.json()
      if (!Array.isArray(users)) throw new Error('Unexpected response from Jellyfin')
      return NextResponse.json({ ok: true })
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message })
    }
  }

  // Plex test
  if (service === 'plex') {
    const stored = readStore().settings.plex
    const config = {
      url: inlineUrl || stored?.url || '',
      apiKey: inlineKey || stored?.apiKey || '',
    }
    if (!config.url || !config.apiKey) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 400 })
    try {
      const res = await fetch(`${config.url.replace(/\/+$/, '')}/`, {
        headers: { 'X-Plex-Token': config.apiKey, Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { MediaContainer?: unknown }
      if (!data.MediaContainer) throw new Error('Unexpected response from Plex')
      return NextResponse.json({ ok: true })
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message })
    }
  }

  // Radarr / Sonarr (existing behaviour)
  if (service !== 'radarr' && service !== 'sonarr')
    return NextResponse.json({ ok: false, error: 'Invalid service' }, { status: 400 })
  const config = (inlineUrl && inlineKey)
    ? { url: inlineUrl, apiKey: inlineKey }
    : readStore().settings[service]
  if (!config) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 400 })
  try {
    const { version } = await getSystemStatus(config.url, config.apiKey)
    return NextResponse.json({ ok: true, version })
  } catch (e) {
    if (e instanceof ArrApiError) return NextResponse.json({ ok: false, error: e.message, code: e.code })
    return NextResponse.json({ ok: false, error: 'Unknown error' })
  }
}
