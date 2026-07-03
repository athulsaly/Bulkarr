'use client'
import { useState, useEffect, useCallback } from 'react'
import type { AutoDeleteRule, DeletionQueueItem, DeletionQueueStatus } from '@/lib/types'

const DELAY_UNITS = ['days', 'weeks', 'months', 'year'] as const

const BLANK_FORM: Partial<AutoDeleteRule> = {
  name: '',
  enabled: true,
  mediaType: 'movie',
  granularity: 'movie',
  action: 'delete',
  deleteFiles: true,
  delayAmount: 7,
  delayUnit: 'days',
  scope: 'global',
}

const STATUS_CHIP: Record<DeletionQueueStatus, string> = {
  pending: 'bg-yellow-800 text-yellow-200',
  done: 'bg-green-800 text-green-200',
  failed: 'bg-red-900 text-red-300',
  cancelled: 'bg-slate-700 text-slate-400',
}

function delayLabel(r: AutoDeleteRule): string {
  return r.delayUnit === 'year' ? '1 year' : `${r.delayAmount} ${r.delayUnit}`
}

function formatScheduled(ts: number): string {
  const diff = ts - Date.now()
  if (Math.abs(diff) < 60_000) return 'now'
  if (diff > 0) {
    if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`
    if (diff < 86_400_000) return `in ${Math.floor(diff / 3_600_000)}h`
    return `in ${Math.floor(diff / 86_400_000)}d`
  }
  const ago = Math.abs(diff)
  if (ago < 3_600_000) return `overdue ${Math.floor(ago / 60_000)}m ago`
  if (ago < 86_400_000) return `overdue ${Math.floor(ago / 3_600_000)}h ago`
  return `overdue ${Math.floor(ago / 86_400_000)}d ago`
}

type QueueFilter = 'all' | DeletionQueueStatus

export function RulesPanel() {
  const [rules, setRules] = useState<AutoDeleteRule[]>([])
  const [queue, setQueue] = useState<DeletionQueueItem[]>([])
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<AutoDeleteRule>>(BLANK_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

  const loadRules = useCallback(() => {
    fetch('/api/rules').then(r => r.json()).then(d => setRules(d.rules ?? []))
  }, [])

  const loadQueue = useCallback(() => {
    fetch('/api/deletion-queue')
      .then(r => r.json())
      .then(d => setQueue(d.items ?? []))
  }, [])

  useEffect(() => { loadRules(); loadQueue() }, [loadRules, loadQueue])

  const handleSaveRule = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const method = editingId ? 'PUT' : 'POST'
      const url = editingId ? `/api/rules/${editingId}` : '/api/rules'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? 'Failed to save'); return }
      setShowForm(false)
      setEditingId(null)
      setForm(BLANK_FORM)
      loadRules()
      loadQueue()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRule = async (id: string) => {
    await fetch(`/api/rules/${id}`, { method: 'DELETE' })
    loadRules()
    loadQueue()
  }

  const handleToggleEnabled = async (rule: AutoDeleteRule) => {
    await fetch(`/api/rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
    })
    loadRules()
  }

  const handleEditRule = (rule: AutoDeleteRule) => {
    setForm({ ...rule })
    setEditingId(rule.id)
    setShowForm(true)
    setFormError(null)
  }

  const handleCancelItem = async (id: string) => {
    await fetch(`/api/deletion-queue/${id}`, { method: 'DELETE' })
    loadQueue()
  }

  const handleExecuteItem = async (id: string) => {
    await fetch(`/api/deletion-queue/${id}/execute`, { method: 'POST' })
    loadQueue()
  }

  const handleTrigger = async () => {
    setTriggering(true)
    try { await fetch('/api/deletion-queue/trigger', { method: 'POST' }) }
    finally { setTriggering(false); loadQueue() }
  }

  const handleEvaluate = async () => {
    setEvaluating(true)
    try { await fetch('/api/deletion-queue/evaluate', { method: 'POST' }) }
    finally { setEvaluating(false); loadQueue() }
  }

  const filteredQueue = queueFilter === 'all' ? queue : queue.filter(i => i.status === queueFilter)

  const queueCounts: Record<QueueFilter, number> = {
    all: queue.length,
    pending: queue.filter(i => i.status === 'pending').length,
    done: queue.filter(i => i.status === 'done').length,
    failed: queue.filter(i => i.status === 'failed').length,
    cancelled: queue.filter(i => i.status === 'cancelled').length,
  }

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      {/* Rules section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Auto-Delete Rules</h2>
          {!showForm && (
            <button
              onClick={() => { setForm(BLANK_FORM); setEditingId(null); setShowForm(true); setFormError(null) }}
              className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded"
            >
              + Add Rule
            </button>
          )}
        </div>

        {showForm && (
          <div className="bg-slate-800 rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Name</label>
                <input
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-indigo-500"
                  value={form.name ?? ''}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Rule name"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Media type</label>
                <select
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.mediaType}
                  onChange={e => {
                    const mt = e.target.value as 'movie' | 'series'
                    setForm(f => ({ ...f, mediaType: mt, granularity: mt === 'movie' ? 'movie' : 'episode' }))
                  }}
                >
                  <option value="movie">Movie</option>
                  <option value="series">Series</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Granularity</label>
                <select
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.granularity}
                  onChange={e => setForm(f => ({ ...f, granularity: e.target.value as AutoDeleteRule['granularity'] }))}
                  disabled={form.mediaType === 'movie'}
                >
                  {form.mediaType === 'movie' ? (
                    <option value="movie">Movie</option>
                  ) : (
                    <>
                      <option value="episode">Episode</option>
                      <option value="season">Season</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Action</label>
                <select
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.action}
                  onChange={e => setForm(f => ({ ...f, action: e.target.value as 'delete' | 'unmonitor' }))}
                >
                  <option value="delete">Delete</option>
                  <option value="unmonitor">Unmonitor</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  id="deleteFiles"
                  checked={form.deleteFiles ?? false}
                  onChange={e => setForm(f => ({ ...f, deleteFiles: e.target.checked }))}
                  disabled={form.action !== 'delete'}
                  className="rounded"
                />
                <label htmlFor="deleteFiles" className="text-sm text-slate-300">Delete files</label>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Delay amount</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.delayAmount ?? 7}
                  onChange={e => setForm(f => ({ ...f, delayAmount: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Delay unit</label>
                <select
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.delayUnit}
                  onChange={e => setForm(f => ({ ...f, delayUnit: e.target.value as AutoDeleteRule['delayUnit'] }))}
                >
                  {DELAY_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Scope</label>
                <select
                  className="w-full bg-slate-700 text-white text-sm rounded px-3 py-1.5 border border-slate-600"
                  value={form.scope}
                  onChange={e => setForm(f => ({ ...f, scope: e.target.value as 'global' | 'specific' }))}
                >
                  <option value="global">Global</option>
                  <option value="specific">Specific title</option>
                </select>
              </div>
            </div>
            {formError && <p className="text-red-400 text-sm">{formError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSaveRule}
                disabled={saving}
                className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm(BLANK_FORM) }}
                className="px-4 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 && !showForm && (
          <p className="text-slate-500 text-sm">No rules yet. Add one to start auto-deleting watched media.</p>
        )}

        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-3">
              <button
                onClick={() => handleToggleEnabled(rule)}
                className={`w-8 h-5 rounded-full transition-colors ${rule.enabled ? 'bg-indigo-600' : 'bg-slate-600'}`}
                title={rule.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
              >
                <span className={`block w-3 h-3 bg-white rounded-full mx-auto transition-transform ${rule.enabled ? 'translate-x-1.5' : '-translate-x-1.5'}`} />
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm font-medium">{rule.name}</span>
                <span className="ml-2 text-slate-400 text-xs">after {delayLabel(rule)}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${rule.action === 'delete' ? 'bg-red-900 text-red-300' : 'bg-blue-900 text-blue-300'}`}>
                {rule.action}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                {rule.scope === 'global' ? 'Global' : rule.scopeTitle ?? `id:${rule.arrId}`}
              </span>
              <button onClick={() => handleEditRule(rule)} className="text-slate-400 hover:text-white text-sm" title="Edit">&#9999;</button>
              <button onClick={() => handleDeleteRule(rule.id)} className="text-slate-400 hover:text-red-400 text-sm" title="Delete">&times;</button>
            </div>
          ))}
        </div>
      </section>

      <hr className="border-slate-700" />

      {/* Queue section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Deletion Queue</h2>
          <div className="flex gap-2">
            <button
              onClick={handleEvaluate}
              disabled={evaluating}
              className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded disabled:opacity-50"
            >
              {evaluating ? 'Evaluating…' : 'Re-evaluate'}
            </button>
            <button
              onClick={handleTrigger}
              disabled={triggering}
              className="px-3 py-1.5 text-xs bg-amber-700 hover:bg-amber-600 text-white rounded disabled:opacity-50"
            >
              {triggering ? 'Running…' : 'Run overdue'}
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-3">
          {(['all', 'pending', 'done', 'failed', 'cancelled'] as QueueFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setQueueFilter(f)}
              className={`px-3 py-1 text-xs rounded ${queueFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              {f} ({queueCounts[f]})
            </button>
          ))}
        </div>

        {filteredQueue.length === 0 && (
          <p className="text-slate-500 text-sm">No items in queue.</p>
        )}

        <div className="space-y-2">
          {filteredQueue.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm">{item.title}</span>
                {item.granularity === 'episode' && item.seasonNumber != null && item.episodeNumber != null && (
                  <span className="ml-1 text-slate-400 text-xs">S{String(item.seasonNumber).padStart(2, '0')}E{String(item.episodeNumber).padStart(2, '0')}</span>
                )}
                {item.granularity === 'season' && item.seasonNumber != null && (
                  <span className="ml-1 text-slate-400 text-xs">S{String(item.seasonNumber).padStart(2, '0')}</span>
                )}
                <span className="ml-2 text-slate-500 text-xs">{item.ruleName}</span>
              </div>
              <span className="text-slate-400 text-xs">{formatScheduled(item.scheduledAt)}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CHIP[item.status]}`}>{item.status}</span>
              {item.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleExecuteItem(item.id)}
                    className="text-xs px-2 py-0.5 bg-amber-700 hover:bg-amber-600 text-white rounded"
                    title="Execute now"
                  >
                    Trigger
                  </button>
                  <button
                    onClick={() => handleCancelItem(item.id)}
                    className="text-slate-400 hover:text-red-400 text-xs"
                    title="Cancel"
                  >
                    &times;
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
