import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { getQualityProfiles, getRootFolders, getLangProfiles, getMovieLibrary, getSeriesLibrary, ArrApiError } from '@/lib/arr-client'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { service } = await req.json() as { service: 'radarr' | 'sonarr' }
  const config = readStore().settings[service]
  if (!config) return NextResponse.json({ error: { code: 'NOT_CONFIGURED', message: `${service} not configured` } }, { status: 400 })

  try {
    const [profiles, rootFolders] = await Promise.all([
      getQualityProfiles(config.url, config.apiKey),
      getRootFolders(config.url, config.apiKey),
    ])

    if (service === 'radarr') {
      const library = await getMovieLibrary(config.url, config.apiKey)
      updateStore(s => { s.cache.radarr = { profiles, rootFolders, library, fetchedAt: Date.now() } })
    } else {
      const [langProfiles, library] = await Promise.all([
        getLangProfiles(config.url, config.apiKey),
        getSeriesLibrary(config.url, config.apiKey),
      ])
      updateStore(s => { s.cache.sonarr = { profiles, rootFolders, langProfiles, library, fetchedAt: Date.now() } })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof ArrApiError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 502 })
    return NextResponse.json({ error: { code: 'UNKNOWN', message: 'Unexpected error' } }, { status: 500 })
  }
}
