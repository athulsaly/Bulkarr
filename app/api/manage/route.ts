import { NextRequest, NextResponse } from 'next/server'
import { readStore, updateStore } from '@/lib/store'
import { deleteMovie, deleteSeries, unmonitorMovie, unmonitorSeries, ArrApiError } from '@/lib/arr-client'
import { throttledBatch } from '@/lib/throttle'
import type { ManageRow, ManageResult } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { target, rows, deleteFiles } = await req.json() as {
    target: 'movies' | 'series'
    rows: ManageRow[]
    deleteFiles: boolean
  }
  const service = target === 'movies' ? 'radarr' : 'sonarr'
  const store = readStore()
  const config = store.settings[service]
  if (!config) {
    return NextResponse.json(
      { error: { code: 'NOT_CONFIGURED', message: `${service} not configured` } },
      { status: 400 }
    )
  }

  const deletedArrIds: number[] = []

  const results = await throttledBatch<ManageRow, ManageResult>(
    rows,
    async row => {
      const match = row.libraryMatches[row.selectedIndex]
      try {
        if (row.action === 'remove') {
          if (target === 'movies') {
            await deleteMovie(config.url, config.apiKey, match.id, deleteFiles)
          } else {
            await deleteSeries(config.url, config.apiKey, match.id, deleteFiles)
          }
          deletedArrIds.push(match.id)
        } else if (row.action === 'unmonitor') {
          if (target === 'movies') {
            await unmonitorMovie(config.url, config.apiKey, match.id)
          } else {
            await unmonitorSeries(config.url, config.apiKey, match.id)
          }
        } else {
          return { rowId: row.id, status: 'failed', errorMessage: 'Invalid action' }
        }
        return { rowId: row.id, status: 'done' }
      } catch (e) {
        if (e instanceof ArrApiError) {
          return { rowId: row.id, status: 'failed', errorCode: e.code, errorMessage: e.message }
        }
        return { rowId: row.id, status: 'failed', errorMessage: 'Unknown error' }
      }
    },
    { concurrency: 3, delayMs: 300 }
  )

  if (deletedArrIds.length > 0) {
    updateStore(s => {
      const bucket = target === 'movies' ? s.posterCache.movies : s.posterCache.series
      for (const id of deletedArrIds) delete bucket[id]
    })
  }

  return NextResponse.json({ results })
}
