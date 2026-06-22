'use client'
import { useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { ReviewRow, ArrItem, Cache } from '@/lib/types'

interface LookupActions {
  lookup: (rawInput: string, target: 'movies' | 'series', cache: Cache) => Promise<ReviewRow[]>
  running: boolean
}

function parseLines(raw: string): string[] {
  return raw.split(/[\n,]+/).map(l => l.trim()).filter(Boolean)
}

function librarySet(cache: Cache, target: 'movies' | 'series'): Set<number> {
  const items = target === 'movies' ? cache.radarr?.library : cache.sonarr?.library
  if (!items) return new Set()
  return new Set(items.map(i => i.tmdbId ?? i.tvdbId ?? -1))
}

export function useLookup(): LookupActions {
  const [running, setRunning] = useState(false)

  const lookup = useCallback(async (rawInput: string, target: 'movies' | 'series', cache: Cache): Promise<ReviewRow[]> => {
    const terms = parseLines(rawInput)
    if (!terms.length) return []

    setRunning(true)

    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, terms }),
      })
      const data = await res.json() as { results: Array<{ candidates: ArrItem[]; error?: string }> }

      const libSet = librarySet(cache, target)

      return terms.map((term, i) => {
        const { candidates, error } = data.results[i] ?? { candidates: [], error: undefined }
        const bestId = candidates[0]?.tmdbId ?? candidates[0]?.tvdbId
        const inLib = bestId ? libSet.has(bestId) : false
        const status: ReviewRow['status'] =
          error ? 'no_match' :
          candidates.length === 0 ? 'no_match' :
          inLib ? 'in_library' :
          'matched'
        return {
          id: uuidv4(),
          inputText: term,
          candidates,
          selectedIndex: 0,
          overrides: {},
          included: status !== 'no_match' && !inLib,
          status,
          errorMessage: error,
        }
      })
    } finally {
      setRunning(false)
    }
  }, [])

  return { lookup, running }
}
