import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { addMovie, addSeries, ArrApiError } from '@/lib/arr-client'
import { throttledBatch } from '@/lib/throttle'
import type { ReviewRow, DefaultsConfig, SubmitResult } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { target, rows, defaults } = await req.json() as {
    target: 'movies' | 'series'; rows: ReviewRow[]; defaults: DefaultsConfig
  }
  const service = target === 'movies' ? 'radarr' : 'sonarr'
  const store = readStore()
  const config = store.settings[service]
  if (!config) return NextResponse.json({ error: { code: 'NOT_CONFIGURED', message: `${service} not configured` } }, { status: 400 })

  const results = await throttledBatch<ReviewRow, SubmitResult>(
    rows,
    async row => {
      const item = row.candidates[row.selectedIndex]
      const cfg = { ...defaults, ...row.overrides }
      try {
        if (target === 'movies') {
          await addMovie(config.url, config.apiKey, {
            tmdbId: item.tmdbId!, title: item.title,
            qualityProfileId: cfg.qualityProfileId, rootFolderPath: cfg.rootFolderPath,
            monitored: cfg.monitored, minimumAvailability: cfg.minimumAvailability ?? 'released',
            addOptions: { searchForMovie: cfg.searchOnAdd },
          })
        } else {
          await addSeries(config.url, config.apiKey, {
            tvdbId: item.tvdbId!, title: item.title,
            qualityProfileId: cfg.qualityProfileId,
            languageProfileId: store.cache.sonarr?.langProfiles?.[0]?.id,
            rootFolderPath: cfg.rootFolderPath, monitored: cfg.monitored,
            seasonFolder: cfg.seasonFolder ?? true, seriesType: cfg.seriesType ?? 'standard',
            addOptions: { searchForMissingEpisodes: cfg.searchOnAdd, monitor: cfg.monitorOption ?? 'all' },
          })
        }
        return { rowId: row.id, status: 'added' }
      } catch (e) {
        if (e instanceof ArrApiError) return { rowId: row.id, status: 'failed', errorCode: e.code, errorMessage: e.message }
        return { rowId: row.id, status: 'failed', errorMessage: 'Unknown error' }
      }
    },
    { concurrency: 3, delayMs: 300 }
  )

  const addedRows = rows.filter((_, i) => results[i]?.status === 'added')
  if (addedRows.length) {
    updateStore(s => {
      for (const row of addedRows) {
        const item = row.candidates[row.selectedIndex]
        s.history.unshift({ id: row.id, title: item.title, year: item.year, target, tmdbId: item.tmdbId, tvdbId: item.tvdbId, remotePoster: item.remotePoster, addedAt: Date.now() })
      }
      if (s.history.length > 500) s.history = s.history.slice(0, 500)
    })
  }

  return NextResponse.json({ results })
}
