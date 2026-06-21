import { NextRequest, NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import { getSystemStatus, ArrApiError } from '@/lib/arr-client'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { service } = await req.json() as { service: 'radarr' | 'sonarr' }
  const config = readStore().settings[service]
  if (!config) return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 400 })
  try {
    const { version } = await getSystemStatus(config.url, config.apiKey)
    return NextResponse.json({ ok: true, version })
  } catch (e) {
    if (e instanceof ArrApiError) return NextResponse.json({ ok: false, error: e.message, code: e.code })
    return NextResponse.json({ ok: false, error: 'Unknown error' })
  }
}
