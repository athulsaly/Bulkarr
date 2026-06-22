'use client'
import { useState, useCallback } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { useSession } from '@/hooks/useSession'
import { useLookup } from '@/hooks/useLookup'
import { useSubmit } from '@/hooks/useSubmit'
import { useToast } from '@/hooks/useToast'
import { SettingsDrawer } from '@/components/SettingsDrawer'
import { DefaultsBar } from '@/components/DefaultsBar'
import { InputPanel } from '@/components/InputPanel'
import { ReviewTable } from '@/components/ReviewTable'
import { ToastStack } from '@/components/ToastStack'
import { SetupScreen } from '@/components/SetupScreen'
import type { ReviewRow, Target } from '@/lib/types'

export default function Page() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { toasts, addToast, dismiss } = useToast()
  const settingsHook = useSettings()
  const [setupDone, setSetupDone] = useState(false)

  // Independent session per target — switching tabs preserves both states
  const [activeTarget, setActiveTarget] = useState<Target>('movies')
  const moviesSession = useSession(null, 'movies')
  const seriesSession = useSession(null, 'series')
  const session = activeTarget === 'movies' ? moviesSession : seriesSession

  const { lookup, progress, running: lookupRunning } = useLookup()
  const { submit, submitting, summary, clearSummary } = useSubmit()

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
    session.setRows(session.rows.map(r => ({ ...r, included })))
  }, [session])

  const tmdbConfigured = !!settingsHook.settings.tmdbApiKey
  const includedMatchedCount = session.rows.filter(r => r.included && (r.status === 'matched' || r.status === 'in_library')).length

  const needsSetup = !settingsHook.loading && !setupDone &&
    !settingsHook.settings.radarr && !settingsHook.settings.sonarr

  if (settingsHook.loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-500 text-sm">Loading…</div>
  }

  if (needsSetup) {
    return <SetupScreen hook={settingsHook} onComplete={() => setSetupDone(true)} />
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <span className="font-bold text-orange-500 tracking-tight">Bulkarr</span>
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-slate-400 hover:text-slate-100 transition-colors text-lg"
          title="Settings"
        >
          ⚙
        </button>
      </header>

      <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} hook={settingsHook} onToast={addToast} />

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
          progress={progress}
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
        <footer className="shrink-0 px-4 py-3 bg-slate-800 border-t border-slate-700 flex items-center gap-4">
          <button
            onClick={handleSubmit}
            disabled={submitting || includedMatchedCount === 0}
            className="rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 font-medium text-sm transition-colors"
          >
            {submitting ? 'Adding…' : `Add Selected (${includedMatchedCount})`}
          </button>
          {summary && (
            <span className="text-sm text-slate-400">
              {summary.added} added · {summary.skipped} skipped · {summary.failed} failed
            </span>
          )}
        </footer>
      )}

      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
