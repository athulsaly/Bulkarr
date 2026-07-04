'use client'
import { useState, useCallback } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { useSession } from '@/hooks/useSession'
import { useLookup } from '@/hooks/useLookup'
import { useSubmit } from '@/hooks/useSubmit'
import { useToast } from '@/hooks/useToast'
import { Spinner } from '@/components/Spinner'
import { DefaultsBar } from '@/components/DefaultsBar'
import { InputPanel } from '@/components/InputPanel'
import { ReviewTable } from '@/components/ReviewTable'
import { NoMatchDrawer } from '@/components/NoMatchDrawer'
import { ToastStack } from '@/components/ToastStack'

export default function AddMoviesPage() {
  const [noMatchOpen, setNoMatchOpen] = useState(false)
  const { toasts, addToast, dismiss } = useToast()
  const { cache, settings } = useSettings()
  const session = useSession(null, 'movies')
  const { lookup, running: lookupRunning } = useLookup()
  const { submit, submitting, summary, progress: submitProgress, clearSummary } = useSubmit()

  const handleLookup = useCallback(async () => {
    clearSummary()
    const rows = await lookup(session.rawInput, 'movies', cache)
    session.setRows(rows)
    if (rows.length > 0 && rows.every(r => r.status === 'no_match')) {
      addToast('No matches found', 'error')
    }
  }, [session, lookup, cache, addToast, clearSummary])

  const handleSubmit = useCallback(async () => {
    const s = await submit(session.rows, 'movies', session.defaults, session.updateRow)
    addToast(
      `Done — ${s.added} added · ${s.skipped} skipped · ${s.failed} failed`,
      s.failed > 0 ? 'error' : 'success',
    )
  }, [session, submit, addToast])

  const handleDeleteRow = useCallback((id: string) => {
    session.setRows(session.rows.filter(r => r.id !== id))
  }, [session])

  const handleToggleAll = useCallback((included: boolean) => {
    session.setRows(session.rows.map(r =>
      (r.status === 'no_match' || r.status === 'in_library') ? r : { ...r, included }
    ))
  }, [session])

  const noMatchEntries = session.rows
    .filter(r => r.status === 'no_match')
    .map(row => ({ row, target: 'movies' as const }))

  const handleClearNoMatches = useCallback(() => {
    session.setRows(session.rows.filter(r => r.status !== 'no_match'))
    setNoMatchOpen(false)
  }, [session])

  const handleRetry = useCallback((text: string, _t: 'movies' | 'series') => {
    session.setRawInput(text)
    setNoMatchOpen(false)
  }, [session])

  const includedMatchedCount = session.rows
    .filter(r => r.included && (r.status === 'matched' || r.status === 'in_library')).length
  const tmdbConfigured = !!settings.tmdbApiKey

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a3a] shrink-0">
        <h1 className="text-lg font-semibold text-slate-100">Add Movies</h1>
        <div className="flex items-center gap-3">
          {noMatchEntries.length > 0 && (
            <button
              onClick={() => setNoMatchOpen(true)}
              className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              No Matches
              <span className="bg-red-900/60 text-red-200 rounded-full px-1.5 py-0.5 text-xs leading-none">
                {noMatchEntries.length}
              </span>
            </button>
          )}
          <button
            onClick={handleLookup}
            disabled={lookupRunning || !session.rawInput.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
          >
            {lookupRunning && <Spinner className="w-3.5 h-3.5" />}
            {lookupRunning ? 'Looking up…' : 'Lookup'}
          </button>
        </div>
      </div>

      <DefaultsBar
        target="movies"
        defaults={session.defaults}
        onDefaultsChange={session.setDefaults}
        cache={cache}
      />

      <main className="flex-1 overflow-auto">
        <InputPanel
          value={session.rawInput}
          onChange={session.setRawInput}
          onLookup={handleLookup}
          running={lookupRunning}
        />
        <ReviewTable
          rows={session.rows}
          defaults={session.defaults}
          cache={cache}
          target="movies"
          cardView={tmdbConfigured}
          onUpdateRow={session.updateRow}
          onDeleteRow={handleDeleteRow}
          onToggleAll={handleToggleAll}
        />
      </main>

      {session.rows.length > 0 && (
        <footer className="sticky bottom-0 z-20 bg-[#161620] border-t border-[#2a2a3a]">
          {submitProgress && (
            <div className="px-4 pt-2 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Adding…</span>
                <span>{submitProgress.done} / {submitProgress.total}</span>
              </div>
              <div className="h-1 w-full bg-[#2a2a3a] rounded overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${(submitProgress.done / submitProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="px-4 py-3 flex items-center gap-4">
            <button
              onClick={handleSubmit}
              disabled={submitting || includedMatchedCount === 0}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 font-medium text-sm transition-colors"
            >
              {submitting && <Spinner className="w-4 h-4" />}
              {submitting ? 'Adding…' : `Add Selected (${includedMatchedCount})`}
            </button>
            {summary && (
              <span className="text-sm text-slate-400">
                {summary.added} added · {summary.skipped} skipped · {summary.failed} failed
              </span>
            )}
          </div>
        </footer>
      )}

      <NoMatchDrawer
        open={noMatchOpen}
        onClose={() => setNoMatchOpen(false)}
        entries={noMatchEntries}
        onRetry={handleRetry}
        onClear={handleClearNoMatches}
      />
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
