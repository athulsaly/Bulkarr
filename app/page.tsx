'use client'
import { useState, useCallback } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { useSession } from '@/hooks/useSession'
import { useLookup } from '@/hooks/useLookup'
import { useSubmit } from '@/hooks/useSubmit'
import { useToast } from '@/hooks/useToast'
import { Spinner } from '@/components/Spinner'
import { SettingsDrawer } from '@/components/SettingsDrawer'
import { DefaultsBar } from '@/components/DefaultsBar'
import { InputPanel } from '@/components/InputPanel'
import { ReviewTable } from '@/components/ReviewTable'
import { ToastStack } from '@/components/ToastStack'
import { SetupScreen } from '@/components/SetupScreen'
import { HistoryDrawer } from '@/components/HistoryDrawer'
import { NoMatchDrawer } from '@/components/NoMatchDrawer'
import type { Target } from '@/lib/types'

export default function Page() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [noMatchOpen, setNoMatchOpen] = useState(false)
  const { toasts, addToast, dismiss } = useToast()
  const settingsHook = useSettings()
  const [setupDone, setSetupDone] = useState(false)

  // Independent session per target — switching tabs preserves both states
  const [activeTarget, setActiveTarget] = useState<Target>('movies')
  const moviesSession = useSession(null, 'movies')
  const seriesSession = useSession(null, 'series')
  const session = activeTarget === 'movies' ? moviesSession : seriesSession

  const { lookup, running: lookupRunning } = useLookup()
  const { submit, submitting, summary, progress: submitProgress, clearSummary } = useSubmit()

  const handleLookup = useCallback(async () => {
    clearSummary()
    const rows = await lookup(session.rawInput, activeTarget, settingsHook.cache)
    session.setRows(rows)
    if (rows.every(r => r.status === 'no_match')) {
      addToast('No matches found', 'error')
    }
  }, [session, activeTarget, lookup, settingsHook.cache, addToast, clearSummary])

  const handleSubmit = useCallback(async () => {
    const s = await submit(session.rows, activeTarget, session.defaults, session.updateRow)
    addToast(`Done — ${s.added} added · ${s.skipped} skipped · ${s.failed} failed`, s.failed > 0 ? 'error' : 'success')
  }, [session, activeTarget, submit, addToast])

  const handleDeleteRow = useCallback((id: string) => {
    session.setRows(session.rows.filter(r => r.id !== id))
  }, [session])

  const handleToggleAll = useCallback((included: boolean) => {
    session.setRows(session.rows.map(r => (r.status === 'no_match' || r.status === 'in_library') ? r : { ...r, included }))
  }, [session])

  const noMatchEntries = [
    ...moviesSession.rows.filter(r => r.status === 'no_match').map(row => ({ row, target: 'movies' as Target })),
    ...seriesSession.rows.filter(r => r.status === 'no_match').map(row => ({ row, target: 'series' as Target })),
  ]

  const handleRetry = useCallback((text: string, target: Target) => {
    if (target === 'movies') moviesSession.setRawInput(text)
    else seriesSession.setRawInput(text)
    setActiveTarget(target)
    setNoMatchOpen(false)
  }, [moviesSession, seriesSession])

  const tmdbConfigured = !!settingsHook.settings.tmdbApiKey
  const includedMatchedCount = session.rows.filter(r => r.included && (r.status === 'matched' || r.status === 'in_library')).length

  const needsSetup = !settingsHook.loading && !setupDone &&
    !settingsHook.settings.radarr && !settingsHook.settings.sonarr

  if (settingsHook.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="w-8 h-8 text-orange-500" />
          <span className="text-slate-500 text-sm">Loading…</span>
        </div>
      </div>
    )
  }

  if (needsSetup) {
    return <SetupScreen hook={settingsHook} onComplete={() => setSetupDone(true)} />
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <span className="font-bold text-orange-500 tracking-tight">Bulkarr</span>
        <div className="flex items-center gap-3">
          {noMatchEntries.length > 0 && (
            <button onClick={() => setNoMatchOpen(true)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors" title="No matches">
              No Matches
              <span className="bg-red-800 text-red-200 rounded-full px-1.5 py-0.5 text-xs leading-none">{noMatchEntries.length}</span>
            </button>
          )}
          <button onClick={() => setHistoryOpen(true)} className="text-slate-400 hover:text-slate-100 transition-colors text-sm" title="History">
            History
          </button>
          <button onClick={() => setDrawerOpen(true)} className="text-slate-400 hover:text-slate-100 transition-colors text-lg" title="Settings">
            ⚙
          </button>
        </div>
      </header>

      <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} hook={settingsHook} onToast={addToast} />
      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <NoMatchDrawer open={noMatchOpen} onClose={() => setNoMatchOpen(false)} entries={noMatchEntries} onRetry={handleRetry} />

      <DefaultsBar
        target={activeTarget}
        onTargetChange={setActiveTarget}
        defaults={session.defaults}
        onDefaultsChange={session.setDefaults}
        cache={settingsHook.cache}
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
          cache={settingsHook.cache}
          target={activeTarget}
          cardView={tmdbConfigured}
          onUpdateRow={session.updateRow}
          onDeleteRow={handleDeleteRow}
          onToggleAll={handleToggleAll}
        />
      </main>

      {/* Submit bar */}
      {session.rows.length > 0 && (
        <footer className="shrink-0 bg-slate-800 border-t border-slate-700">
          {submitProgress && (
            <div className="px-4 pt-2 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Adding…</span>
                <span>{submitProgress.done} / {submitProgress.total}</span>
              </div>
              <div className="h-1 w-full bg-slate-700 rounded overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-200"
                  style={{ width: `${(submitProgress.done / submitProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="px-4 py-3 flex items-center gap-4">
            <button
              onClick={handleSubmit}
              disabled={submitting || includedMatchedCount === 0}
              className="flex items-center gap-2 rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 font-medium text-sm transition-colors"
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

      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
