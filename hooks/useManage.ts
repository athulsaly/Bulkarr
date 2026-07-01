'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { ManageRow, ManageResult, LibraryItem, Cache } from '@/lib/types'

function parseLines(raw: string): string[] {
  return raw.split(/[\n,]+/).map(l => l.trim()).filter(Boolean)
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

function findMatches(term: string, items: LibraryItem[]): LibraryItem[] {
  const n = normalise(term)
  const exact = items.filter(i => normalise(i.title) === n)
  if (exact.length) return exact
  return items.filter(i => normalise(i.title).includes(n) || n.includes(normalise(i.title)))
}

interface ManageSummary { done: number; failed: number }

interface ManageActions {
  match: (rawInput: string, target: 'movies' | 'series', cache: Cache) => ManageRow[]
  submit: (
    rows: ManageRow[],
    target: 'movies' | 'series',
    deleteFiles: boolean,
    updateRow: (id: string, patch: Partial<ManageRow>) => void,
  ) => Promise<ManageSummary>
  submitting: boolean
  progress: { done: number; total: number } | null
  summary: ManageSummary | null
  clearSummary: () => void
}

export function useManage(): ManageActions {
  const [submitting, setSubmitting] = useState(false)
  const [summary, setSummary] = useState<ManageSummary | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const clearProgressTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => { clearTimeout(clearProgressTimer.current) }, [])

  const match = useCallback((rawInput: string, target: 'movies' | 'series', cache: Cache): ManageRow[] => {
    const terms = Array.from(new Set(parseLines(rawInput)))
    const library = (target === 'movies' ? cache.radarr?.library : cache.sonarr?.library) ?? []
    return terms.map(term => {
      const libraryMatches = findMatches(term, library)
      return {
        id: uuidv4(),
        inputText: term,
        libraryMatches,
        selectedIndex: 0,
        action: 'remove' as const,
        status: libraryMatches.length > 0 ? 'matched' : 'no_match',
      }
    })
  }, [])

  const submit = useCallback(async (
    rows: ManageRow[],
    target: 'movies' | 'series',
    deleteFiles: boolean,
    updateRow: (id: string, patch: Partial<ManageRow>) => void,
  ): Promise<ManageSummary> => {
    const eligible = rows.filter(r => r.status === 'matched')
    setSubmitting(true)
    setSummary(null)
    setProgress({ done: 0, total: eligible.length })

    let done = 0, failed = 0

    try {
      const res = await fetch('/api/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, rows: eligible, deleteFiles }),
      })
      if (!res.ok) throw new Error(`manage API error ${res.status}`)
      const data = await res.json() as { results: ManageResult[] }

      for (const result of data.results) {
        if (result.status === 'done') {
          done++
          updateRow(result.rowId, { status: 'done' })
        } else {
          failed++
          updateRow(result.rowId, { status: 'failed', errorMessage: result.errorMessage })
        }
        setProgress(p => p ? { done: p.done + 1, total: p.total } : null)
      }

      const s = { done, failed }
      setSummary(s)
      return s
    } finally {
      setSubmitting(false)
      clearTimeout(clearProgressTimer.current)
      clearProgressTimer.current = setTimeout(() => setProgress(null), 700)
    }
  }, [])

  const clearSummary = useCallback(() => {
    setSummary(null)
    clearTimeout(clearProgressTimer.current)
    setProgress(null)
  }, [])

  return { match, submit, submitting, progress, summary, clearSummary }
}
