'use client'
import { useState, useCallback, useEffect } from 'react'
import { useManage } from '@/hooks/useManage'
import { useToast } from '@/hooks/useToast'
import { Spinner } from '@/components/Spinner'
import { ManageTable } from '@/components/ManageTable'
import { InputPanel } from '@/components/InputPanel'
import { ToastStack } from '@/components/ToastStack'
import type { ManageRow, Target } from '@/lib/types'

export default function ManagePage() {
  const [activeTarget, setActiveTarget] = useState<Target>('movies')
  const [manageRows, setManageRows] = useState<ManageRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [manageInput, setManageInput] = useState('')
  const { toasts, addToast, dismiss } = useToast()
  const manageHook = useManage()

  useEffect(() => {
    setManageRows([])
    setSelectedIds(new Set())
    manageHook.clearSummary()
    setDeleteFiles(false)
  }, [activeTarget, manageHook])

  const handleLookup = useCallback(async () => {
    manageHook.clearSummary()
    const rows = await manageHook.lookup(manageInput, activeTarget)
    setManageRows(rows)
    setSelectedIds(new Set(rows.filter(r => r.status === 'matched').map(r => r.id)))
    if (rows.length > 0 && rows.every(r => r.status === 'no_match')) {
      addToast('No library matches found', 'error')
    }
  }, [manageInput, activeTarget, manageHook, addToast])

  const handleSubmit = useCallback(async (action: 'remove' | 'unmonitor') => {
    const updateRow = (id: string, patch: Partial<ManageRow>) =>
      setManageRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    const rowsToSubmit = manageRows
      .filter(r => selectedIds.has(r.id) && r.status === 'matched')
      .map(r => ({ ...r, action }))
    const s = await manageHook.submit(rowsToSubmit, activeTarget, deleteFiles, updateRow)
    addToast(`Done — ${s.done} applied · ${s.failed} failed`, s.failed > 0 ? 'error' : 'success')
  }, [manageRows, selectedIds, activeTarget, deleteFiles, manageHook, addToast])

  const handleDeleteRow = useCallback((id: string) => {
    setManageRows(prev => prev.filter(r => r.id !== id))
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }, [])

  const handleUpdateRow = useCallback((id: string, patch: Partial<ManageRow>) => {
    setManageRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }, [])

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    const matchedIds = manageRows.filter(r => r.status === 'matched').map(r => r.id)
    const allSelected = matchedIds.length > 0 && matchedIds.every(id => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(matchedIds))
  }, [manageRows, selectedIds])

  const eligibleCount = manageRows.filter(r => r.status === 'matched' && selectedIds.has(r.id)).length

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#2a2a3a] shrink-0">
        <h1 className="text-lg font-semibold text-slate-100">Manage</h1>
        <div className="flex rounded overflow-hidden border border-[#2a2a3a]">
          {(['movies', 'series'] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTarget(t)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                activeTarget === t ? 'bg-indigo-600 text-white' : 'bg-[#1c1c28] text-slate-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-auto">
        <InputPanel
          value={manageInput}
          onChange={setManageInput}
          onLookup={handleLookup}
          running={manageHook.looking}
        />
        <ManageTable
          rows={manageRows}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onUpdateRow={handleUpdateRow}
          onDeleteRow={handleDeleteRow}
        />
      </main>

      {manageRows.length > 0 && (
        <footer className="sticky bottom-0 z-20 bg-[#161620] border-t border-[#2a2a3a]">
          {manageHook.progress && (
            <div className="px-4 pt-2 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Applying…</span>
                <span>{manageHook.progress.done} / {manageHook.progress.total}</span>
              </div>
              <div className="h-1 w-full bg-[#2a2a3a] rounded overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${(manageHook.progress.done / manageHook.progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-500 shrink-0">{eligibleCount} selected</span>
            <button
              onClick={() => handleSubmit('remove')}
              disabled={manageHook.submitting || eligibleCount === 0}
              className="flex items-center gap-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-1.5 font-medium text-sm transition-colors"
            >
              {manageHook.submitting && <Spinner className="w-3.5 h-3.5" />}
              Remove selected
            </button>
            <button
              onClick={() => handleSubmit('unmonitor')}
              disabled={manageHook.submitting || eligibleCount === 0}
              className="flex items-center gap-2 rounded-lg bg-[#2a2a3a] hover:bg-[#3a3a4a] disabled:opacity-40 disabled:cursor-not-allowed px-4 py-1.5 font-medium text-sm transition-colors"
            >
              Unmonitor selected
            </button>
            <label className={`flex items-center gap-1.5 text-xs cursor-pointer ml-1 ${eligibleCount > 0 ? 'text-slate-300' : 'text-slate-600 cursor-not-allowed'}`}>
              <input
                type="checkbox"
                checked={deleteFiles}
                disabled={eligibleCount === 0}
                onChange={e => setDeleteFiles(e.target.checked)}
                className="accent-indigo-500 disabled:opacity-30"
              />
              Delete files
            </label>
            {manageHook.summary && (
              <span className="text-sm text-slate-400 ml-1">
                {manageHook.summary.done} applied · {manageHook.summary.failed} failed
              </span>
            )}
          </div>
        </footer>
      )}

      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
