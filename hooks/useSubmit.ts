'use client'
import { useState, useCallback, useRef } from 'react'
import { throttledBatch } from '@/lib/throttle'
import type { ReviewRow, DefaultsConfig, SubmitResult } from '@/lib/types'

interface Summary { added: number; skipped: number; failed: number }

interface SubmitActions {
  submit: (
    rows: ReviewRow[],
    target: 'movies' | 'series',
    defaults: DefaultsConfig,
    updateRow: (id: string, patch: Partial<ReviewRow>) => void,
  ) => Promise<Summary>
  submitting: boolean
  summary: Summary | null
  progress: { done: number; total: number } | null
  clearSummary: () => void
}

export function useSubmit(): SubmitActions {
  const [submitting, setSubmitting] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const clearProgressTimer = useRef<ReturnType<typeof setTimeout>>()

  const submit = useCallback(async (
    rows: ReviewRow[],
    target: 'movies' | 'series',
    defaults: DefaultsConfig,
    updateRow: (id: string, patch: Partial<ReviewRow>) => void,
  ): Promise<Summary> => {
    const eligible = rows.filter(r => r.included && (r.status === 'matched' || r.status === 'in_library'))
    setSubmitting(true)
    setSummary(null)
    setProgress({ done: 0, total: eligible.length })

    let added = 0, failed = 0

    try {
      await throttledBatch<ReviewRow, void>(
        eligible,
        async row => {
          const res = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, rows: [row], defaults }),
          })
          const data = await res.json() as { results: SubmitResult[] }
          const result = data.results[0]
          if (result?.status === 'added') {
            added++
            updateRow(result.rowId, { status: 'added' })
          } else if (result) {
            failed++
            updateRow(result.rowId, { status: 'failed', errorMessage: result.errorMessage })
          }
          setProgress(p => p ? { done: p.done + 1, total: p.total } : null)
        },
        { concurrency: 3, delayMs: 300 }
      )

      const s = { added, skipped: rows.length - eligible.length, failed }
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

  return { submit, submitting, summary, progress, clearSummary }
}
