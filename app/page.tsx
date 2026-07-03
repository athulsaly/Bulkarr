'use client'
import { useState, useCallback, useEffect } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { useSession } from '@/hooks/useSession'
import { useLookup } from '@/hooks/useLookup'
import { useSubmit } from '@/hooks/useSubmit'
import { useManage } from '@/hooks/useManage'
import { useToast } from '@/hooks/useToast'
import { Spinner } from '@/components/Spinner'
import { SettingsDrawer } from '@/components/SettingsDrawer'
import { DefaultsBar } from '@/components/DefaultsBar'
import { InputPanel } from '@/components/InputPanel'
import { ReviewTable } from '@/components/ReviewTable'
import { ManageTable } from '@/components/ManageTable'
import { ToastStack } from '@/components/ToastStack'
import { SetupScreen } from '@/components/SetupScreen'
import { HistoryDrawer } from '@/components/HistoryDrawer'
import { WatchedDrawer } from '@/components/WatchedDrawer'
import { NoMatchDrawer } from '@/components/NoMatchDrawer'
import { RulesPanel } from '@/components/RulesPanel'
import type { Target, ManageRow } from '@/lib/types'

export default function Page() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [watchedOpen, setWatchedOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [unmatchedCount, setUnmatchedCount] = useState(0)
  const [noMatchOpen, setNoMatchOpen] = useState(false)
  const { toasts, addToast, dismiss } = useToast()
  const settingsHook = useSettings()
  const [setupDone, setSetupDone] = useState(false)

  const [activeTarget, setActiveTarget] = useState<Target>('movies')
  const [activeMode, setActiveMode] = useState<'add' | 'manage'>('add')

  const moviesSession = useSession(null, 'movies')
  const seriesSession = useSession(null, 'series')
  const session = activeTarget === 'movies' ? moviesSession : seriesSession

  const { lookup, running: lookupRunning } = useLookup()
  const { submit, submitting, summary, progress: submitProgress, clearSummary } = useSubmit()

  const manageHook = useManage()
  const [manageRows, setManageRows] = useState<ManageRow[]>([])
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [manageInput, setManageInput] = useState('')

  useEffect(() => {
    if (activeMode === 'manage') {
      setManageRows([])
      manageHook.clearSummary()
    }
  }, [activeTarget])

  useEffect(() => {
    setDeleteFiles(false)
  }, [activeTarget, activeMode])

  // ── Add mode handlers ────────────────────────────────────────────────────
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

  // ── Manage mode handlers ─────────────────────────────────────────────────
  const handleManageLookup = useCallback(() => {
    manageHook.clearSummary()
    const rows = manageHook.match(manageInput, activeTarget, settingsHook.cache)
    setManageRows(rows)
    if (rows.length > 0 && rows.every(r => r.status === 'no_match')) {
      addToast('No library matches found', 'error')
    }
  }, [manageInput, activeTarget, settingsHook.cache, manageHook, addToast])

  const handleManageSubmit = useCallback(async () => {
    const updateRow = (id: string, patch: Partial<ManageRow>) => {
      setManageRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    }
    const s = await manageHook.submit(manageRows, activeTarget, deleteFiles, updateRow)
    addToast(`Done — ${s.done} applied · ${s.failed} failed`, s.failed > 0 ? 'error' : 'success')
  }, [manageRows, activeTarget, deleteFiles, manageHook, addToast])

  const handleManageDeleteRow = useCallback((id: string) => {
    setManageRows(prev => prev.filter(r => r.id !== id))
  }, [])

  const handleManageUpdateRow = useCallback((id: string, patch: Partial<ManageRow>) => {
    setManageRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }, [])

  // ── Shared ───────────────────────────────────────────────────────────────
  const noMatchEntries = [
    ...moviesSession.rows.filter(r => r.status === 'no_match').map(row => ({ row, target: 'movies' as Target })),
    ...seriesSession.rows.filter(r => r.status === 'no_match').map(row => ({ row, target: 'series' as Target })),
  ]

  const handleClearNoMatches = useCallback(() => {
    moviesSession.setRows(moviesSession.rows.filter(r => r.status !== 'no_match'))
    seriesSession.setRows(seriesSession.rows.filter(r => r.status !== 'no_match'))
    setNoMatchOpen(false)
  }, [moviesSession, seriesSession])

  const handleRetry = useCallback((text: string, target: Target) => {
    if (target === 'movies') moviesSession.setRawInput(text)
    else seriesSession.setRawInput(text)
    setActiveTarget(target)
    setNoMatchOpen(false)
  }, [moviesSession, seriesSession])

  const tmdbConfigured = !!settingsHook.settings.tmdbApiKey
  const includedMatchedCount = session.rows.filter(r => r.included && (r.status === 'matched' || r.status === 'in_library')).length
  const manageEligibleCount = manageRows.filter(r => r.status === 'matched').length
  const hasRemoveRows = manageRows.some(r => r.status === 'matched' && r.action === 'remove')

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

  const isManage = activeMode === 'manage'
  const currentInput = isManage ? manageInput : session.rawInput
  const handleInputChange = isManage ? setManageInput : session.setRawInput
  const handleLookupAction = isManage ? handleManageLookup : handleLookup

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
          <button
            onClick={() => setRulesOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
          >
            Rules
          </button>
          <button
            onClick={() => setWatchedOpen(true)}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-100 transition-colors text-sm"
            title="Watched events"
          >
            Watched
            {unmatchedCount > 0 && (
              <span className="bg-blue-800 text-blue-200 rounded-full px-1.5 py-0.5 text-xs leading-none">
                {unmatchedCount}
              </span>
            )}
          </button>
          <button onClick={() => setDrawerOpen(true)} className="text-slate-400 hover:text-slate-100 transition-colors text-lg" title="Settings">
            ⚙
          </button>
        </div>
      </header>

      <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} hook={settingsHook} onToast={addToast} />
      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <WatchedDrawer
        open={watchedOpen}
        onClose={() => setWatchedOpen(false)}
        onUnmatchedCountChange={setUnmatchedCount}
      />
      {rulesOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900 overflow-y-auto">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
            <button
              onClick={() => setRulesOpen(false)}
              className="text-sm text-slate-400 hover:text-white"
            >
              ← Back
            </button>
            <h1 className="text-white font-semibold">Auto-Delete Rules</h1>
          </div>
          <RulesPanel />
        </div>
      )}
      <NoMatchDrawer open={noMatchOpen} onClose={() => setNoMatchOpen(false)} entries={noMatchEntries} onRetry={handleRetry} onClear={handleClearNoMatches} />

      <DefaultsBar
        target={activeTarget}
        onTargetChange={setActiveTarget}
        activeMode={activeMode}
        onModeChange={mode => { setActiveMode(mode); manageHook.clearSummary(); clearSummary() }}
        defaults={session.defaults}
        onDefaultsChange={session.setDefaults}
        cache={settingsHook.cache}
      />

      <main className="flex-1 overflow-auto">
        <InputPanel
          value={currentInput}
          onChange={handleInputChange}
          onLookup={handleLookupAction}
          running={lookupRunning}
        />

        {isManage ? (
          <ManageTable
            rows={manageRows}
            onUpdateRow={handleManageUpdateRow}
            onDeleteRow={handleManageDeleteRow}
            onToggleAll={() => {}}
          />
        ) : (
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
        )}
      </main>

      {/* Submit bar */}
      {isManage ? (
        manageRows.length > 0 && (
          <footer className="shrink-0 bg-slate-800 border-t border-slate-700">
            {manageHook.progress && (
              <div className="px-4 pt-2 space-y-1">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Applying…</span>
                  <span>{manageHook.progress.done} / {manageHook.progress.total}</span>
                </div>
                <div className="h-1 w-full bg-slate-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-orange-500 transition-all duration-200"
                    style={{ width: `${(manageHook.progress.done / manageHook.progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <div className="px-4 py-3 flex items-center gap-4">
              <button
                onClick={handleManageSubmit}
                disabled={manageHook.submitting || manageEligibleCount === 0}
                className="flex items-center gap-2 rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 font-medium text-sm transition-colors"
              >
                {manageHook.submitting && <Spinner className="w-4 h-4" />}
                {manageHook.submitting ? 'Applying…' : `Apply to Selected (${manageEligibleCount})`}
              </button>
              <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${hasRemoveRows ? 'text-slate-300' : 'text-slate-600 cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  checked={deleteFiles}
                  disabled={!hasRemoveRows}
                  onChange={e => setDeleteFiles(e.target.checked)}
                  className="accent-orange-500 disabled:opacity-30"
                />
                Delete files
              </label>
              {manageHook.summary && (
                <span className="text-sm text-slate-400">
                  {manageHook.summary.done} applied · {manageHook.summary.failed} failed
                </span>
              )}
            </div>
          </footer>
        )
      ) : (
        session.rows.length > 0 && (
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
        )
      )}

      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
