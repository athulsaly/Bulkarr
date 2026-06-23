import { NextRequest, NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import { getSystemStatus, ArrApiError } from '@/lib/arr-client'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { service, url: inlineUrl, apiKey: inlineKey } = await req.json() as {
    service: string; url?: string; apiKey?: string
  }
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
