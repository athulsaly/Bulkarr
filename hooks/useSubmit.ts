'use client'
import { useState, useCallback } from 'react'
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
  clearSummary: () => void
}

export function useSubmit(): SubmitActions {
  const [submitting, setSubmitting] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)

  const submit = useCallback(async (
    rows: ReviewRow[],
    target: 'movies' | 'series',
    defaults: DefaultsConfig,
    updateRow: (id: string, patch: Partial<ReviewRow>) => void,
  ): Promise<Summary> => {
    const eligible = rows.filter(r => r.included && (r.status === 'matched' || r.status === 'in_library'))
    setSubmitting(true)
    setSummary(null)

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, rows: eligible, defaults }),
      })
      const data = await res.json() as { results: SubmitResult[] }

      let added = 0, skipped = 0, failed = 0
      for (const result of data.results) {
        if (result.status === 'added') {
          added++
          updateRow(result.rowId, { status: 'added' })
        } else {
          failed++
          updateRow(result.rowId, { status: 'failed', errorMessage: result.errorMessage })
        }
      }
      skipped = rows.length - eligible.length

      const s = { added, skipped, failed }
      setSummary(s)
      return s
    } finally {
      setSubmitting(false)
    }
  }, [])

  const clearSummary = useCallback(() => setSummary(null), [])

  return { submit, submitting, summary, clearSummary }
}
