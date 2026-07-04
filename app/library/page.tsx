'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Spinner } from '@/components/Spinner'
import { LibraryCard } from '@/components/LibraryCard'
import type { LibraryItemFull, AutoDeleteRule } from '@/lib/types'

const DELAY_UNITS = ['days', 'weeks', 'months', 'year'] as const

interface NewRuleForm {
  name: string
  action: 'delete' | 'unmonitor'
  deleteFiles: boolean
  delayAmount: number
  delayUnit: typeof DELAY_UNITS[number]
  granularity: 'movie' | 'episode' | 'season'
}

const blankNewRule = (target: 'movies' | 'series'): NewRuleForm => ({
  name: '',
  action: 'delete',
  deleteFiles: false,
  delayAmount: 7,
  delayUnit: 'days',
  granularity: target === 'movies' ? 'movie' : 'episode',
})

// ── Sort ─────────────────────────────────────────────────────────────────────

type SortKey = 'title-asc' | 'title-desc' | 'year-desc' | 'year-asc' | 'date-desc' | 'date-asc' | 'size-desc' | 'size-asc'

const SORT_LABELS: Record<SortKey, string> = {
  'title-asc': 'Title (A→Z)',
  'title-desc': 'Title (Z→A)',
  'year-desc': 'Year (Newest)',
  'year-asc': 'Year (Oldest)',
  'date-desc': 'Date Added (Newest)',
  'date-asc': 'Date Added (Oldest)',
  'size-desc': 'Size (Largest)',
  'size-asc': 'Size (Smallest)',
}

function sortItems(items: LibraryItemFull[], key: SortKey): LibraryItemFull[] {
  return [...items].sort((a, b) => {
    switch (key) {
      case 'title-asc': return a.title.localeCompare(b.title)
      case 'title-desc': return b.title.localeCompare(a.title)
      case 'year-desc': return (b.year ?? 0) - (a.year ?? 0)
      case 'year-asc': return (a.year ?? 0) - (b.year ?? 0)
      case 'date-desc': return (b.addedDate > a.addedDate ? 1 : -1)
      case 'date-asc': return (a.addedDate > b.addedDate ? 1 : -1)
      case 'size-desc': return b.sizeOnDisk - a.sizeOnDisk
      case 'size-asc': return a.sizeOnDisk - b.sizeOnDisk
    }
  })
}

// ── Filters ───────────────────────────────────────────────────────────────────

interface Filters {
  monitored: 'all' | 'monitored' | 'unmonitored'
  files: 'all' | 'has-files' | 'missing'
  rule: 'all' | 'has-rule' | 'no-rule'
  profile: 'all' | string
  status: 'all' | string
}

const DEFAULT_FILTERS: Filters = {
  monitored: 'all',
  files: 'all',
  rule: 'all',
  profile: 'all',
  status: 'all',
}

function applyFilters(items: LibraryItemFull[], f: Filters, search: string): LibraryItemFull[] {
  let out = items
  if (search.trim()) out = out.filter(i => i.title.toLowerCase().includes(search.toLowerCase()))
  if (f.monitored === 'monitored') out = out.filter(i => i.monitored)
  if (f.monitored === 'unmonitored') out = out.filter(i => !i.monitored)
  if (f.files === 'has-files') out = out.filter(i => i.hasFile)
  if (f.files === 'missing') out = out.filter(i => !i.hasFile)
  if (f.rule === 'has-rule') out = out.filter(i => i.assignedRules.length > 0)
  if (f.rule === 'no-rule') out = out.filter(i => i.assignedRules.length === 0)
  if (f.profile !== 'all') out = out.filter(i => String(i.qualityProfileId) === f.profile)
  if (f.status !== 'all') out = out.filter(i => i.arrStatus === f.status)
  return out
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}

function delayLabel(r: AutoDeleteRule): string {
  return r.delayUnit === 'year' ? '1 year' : `${r.delayAmount} ${r.delayUnit}`
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function activeFilterCount(f: Filters): number {
  return Object.values(f).filter(v => v !== 'all').length
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [target, setTarget] = useState<'movies' | 'series'>('movies')
  const [items, setItems] = useState<LibraryItemFull[]>([])
  const [rules, setRules] = useState<AutoDeleteRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('title-asc')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [view, setView] = useState<'list' | 'cards'>('list')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTargetItems, setAssignTargetItems] = useState<LibraryItemFull[]>([])
  const [pickedRuleId, setPickedRuleId] = useState<string>('')
  const [assigning, setAssigning] = useState(false)
  const [modalMode, setModalMode] = useState<'pick' | 'create'>('pick')
  const [newRuleForm, setNewRuleForm] = useState<NewRuleForm>(() => blankNewRule('movies'))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => setToast(msg)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const loadLibrary = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSelectedIds(new Set())
    try {
      const res = await fetch(`/api/library?target=${target}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed to load'); return }
      setItems(d.items ?? [])
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [target])

  const loadRules = useCallback(async () => {
    const res = await fetch('/api/rules')
    if (res.ok) {
      const d = await res.json()
      setRules(d.rules ?? [])
    }
  }, [])

  useEffect(() => {
    loadLibrary()
    loadRules()
    setSearch('')
    setFilters(DEFAULT_FILTERS)
  }, [loadLibrary, loadRules])

  // Derived
  const profiles = useMemo(() => {
    const seen = new Map<string, string>()
    for (const i of items) {
      if (i.qualityProfileId && i.qualityProfileName) {
        seen.set(String(i.qualityProfileId), i.qualityProfileName)
      }
    }
    return [...seen.entries()]
  }, [items])

  const statuses = useMemo(() => {
    const seen = new Set<string>()
    for (const i of items) if (i.arrStatus) seen.add(i.arrStatus)
    return [...seen]
  }, [items])

  const filtered = useMemo(
    () => sortItems(applyFilters(items, filters, search), sort),
    [items, filters, search, sort]
  )

  const allSelected = filtered.length > 0 && filtered.every(i => selectedIds.has(i.id))
  const someSelected = !allSelected && filtered.some(i => selectedIds.has(i.id))

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [allSelected, someSelected])

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(i => i.id)))
  }

  const toggleItem = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedCount = filtered.filter(i => selectedIds.has(i.id)).length

  const compatibleRules = rules.filter(r =>
    r.mediaType === (target === 'movies' ? 'movie' : 'series')
  )

  const openAssignFor = (targetItems: LibraryItemFull[]) => {
    setAssignTargetItems(targetItems)
    setPickedRuleId(compatibleRules[0]?.id ?? '')
    setModalMode('pick')
    setNewRuleForm(blankNewRule(target))
    setCreateError(null)
    setAssignOpen(true)
  }

  const handleCreateAndAssign = async () => {
    if (!newRuleForm.name.trim()) { setCreateError('Name is required'); return }
    if (!assignTargetItems.length) return
    setCreating(true)
    setCreateError(null)
    try {
      const payload = {
        name: newRuleForm.name.trim(),
        enabled: true,
        mediaType: target === 'movies' ? 'movie' : 'series' as 'movie' | 'series',
        granularity: newRuleForm.granularity,
        action: newRuleForm.action,
        deleteFiles: newRuleForm.deleteFiles,
        delayAmount: newRuleForm.delayAmount,
        delayUnit: newRuleForm.delayUnit,
        targets: assignTargetItems.map(i => ({ arrId: i.id, arrTarget: target, scopeTitle: i.title })),
      }
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json() as { rule?: AutoDeleteRule; error?: string }
      if (!res.ok) { setCreateError(d.error ?? 'Failed to create rule'); return }
      showToast(`Rule "${payload.name}" created and assigned to ${assignTargetItems.length} item(s)`)
      setAssignOpen(false)
      await loadLibrary()
      await loadRules()
    } finally {
      setCreating(false)
    }
  }

  const handleAssign = async () => {
    if (!pickedRuleId || !assignTargetItems.length) return
    setAssigning(true)
    try {
      const res = await fetch('/api/library/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          items: assignTargetItems.map(i => ({ arrId: i.id, scopeTitle: i.title })),
          ruleId: pickedRuleId,
        }),
      })
      const d = await res.json()
      if (!res.ok) { showToast(d.error ?? 'Failed to assign'); return }
      const n = d.added ?? 0
      showToast(n > 0 ? `Rule assigned to ${n} item(s)` : 'Already assigned to all selected')
      setAssignOpen(false)
      await loadLibrary()
      await loadRules()
    } finally {
      setAssigning(false)
    }
  }

  const handleUnassign = async (ruleId: string, arrId: number) => {
    await fetch('/api/library/assign', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleId, arrId, arrTarget: target }),
    })
    await loadLibrary()
    await loadRules()
    showToast('Rule removed from this title')
  }

  const setFilter = <K extends keyof Filters>(key: K, val: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: val }))
  }

  const filterCount = activeFilterCount(filters)

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#2a2a3a] bg-[#161620] shrink-0">
        {/* Target tabs */}
        <div className="flex gap-1 shrink-0">
          {(['movies', 'series'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTarget(t)}
              className={`px-3 py-1.5 text-sm rounded capitalize transition-colors ${
                target === t ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[#2a2a3a] mx-1 hidden sm:block" />

        {/* Search */}
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-[#1c1c28] text-sm rounded px-3 py-1.5 border border-[#2a2a3a] focus:outline-none focus:border-indigo-500/60 w-44 text-white placeholder-slate-500"
        />

        {/* Sort */}
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="bg-[#1c1c28] text-sm rounded px-3 py-1.5 border border-[#2a2a3a] focus:outline-none focus:border-indigo-500/60 text-slate-200"
        >
          {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>

        {/* Filters toggle */}
        <button
          onClick={() => setFiltersOpen(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
            filterCount > 0 || filtersOpen
              ? 'bg-indigo-700 text-white'
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          Filters
          {filterCount > 0 && (
            <span className="bg-indigo-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {filterCount}
            </span>
          )}
        </button>

        {/* View toggle */}
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setView('list')}
            title="List view"
            className={`px-2.5 py-1.5 text-sm rounded transition-colors ${view === 'list' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            ☰
          </button>
          <button
            onClick={() => setView('cards')}
            title="Card view"
            className={`px-2.5 py-1.5 text-sm rounded transition-colors ${view === 'cards' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            ⊞
          </button>
        </div>

        <button
          onClick={loadLibrary}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded disabled:opacity-50 transition-colors shrink-0"
        >
          {loading ? <Spinner className="w-3 h-3" /> : null}
          Refresh
        </button>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-[#2a2a3a] bg-[#1c1c28]/50 shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Monitored</label>
            <select
              value={filters.monitored}
              onChange={e => setFilter('monitored', e.target.value as Filters['monitored'])}
              className="bg-white/5 text-xs rounded px-2 py-1 border border-white/10 text-slate-200"
            >
              <option value="all">All</option>
              <option value="monitored">Monitored</option>
              <option value="unmonitored">Unmonitored</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Files</label>
            <select
              value={filters.files}
              onChange={e => setFilter('files', e.target.value as Filters['files'])}
              className="bg-white/5 text-xs rounded px-2 py-1 border border-white/10 text-slate-200"
            >
              <option value="all">All</option>
              <option value="has-files">Has Files</option>
              <option value="missing">Missing</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Rule</label>
            <select
              value={filters.rule}
              onChange={e => setFilter('rule', e.target.value as Filters['rule'])}
              className="bg-white/5 text-xs rounded px-2 py-1 border border-white/10 text-slate-200"
            >
              <option value="all">All</option>
              <option value="has-rule">Has Specific Rule</option>
              <option value="no-rule">No Specific Rule</option>
            </select>
          </div>
          {profiles.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Quality</label>
              <select
                value={filters.profile}
                onChange={e => setFilter('profile', e.target.value)}
                className="bg-white/5 text-xs rounded px-2 py-1 border border-white/10 text-slate-200"
              >
                <option value="all">All</option>
                {profiles.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          )}
          {statuses.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Status</label>
              <select
                value={filters.status}
                onChange={e => setFilter('status', e.target.value)}
                className="bg-white/5 text-xs rounded px-2 py-1 border border-white/10 text-slate-200"
              >
                <option value="all">All</option>
                {statuses.map(s => (
                  <option key={s} value={s} className="capitalize">{s}</option>
                ))}
              </select>
            </div>
          )}
          {filterCount > 0 && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-xs text-indigo-400 hover:text-indigo-300 ml-1"
            >
              Clear all
            </button>
          )}
          <span className="text-xs text-slate-500 ml-auto self-center">
            {filtered.length} / {items.length} items
          </span>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {error && (
          <div className="m-6 p-3 bg-red-900/40 text-red-300 rounded text-sm">{error}</div>
        )}

        {loading && items.length === 0 && (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
            <Spinner className="w-5 h-5" />
            <span className="text-sm">Loading library…</span>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-20">
            {items.length === 0 ? 'No media in library.' : 'No items match the current filters.'}
          </p>
        )}

        {/* ── LIST VIEW ── */}
        {view === 'list' && filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-[#1c1c28] border-b border-[#2a2a3a] sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2.5 w-10">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="accent-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-2.5 text-left text-slate-400 font-normal">Title</th>
                <th className="px-4 py-2.5 text-left text-slate-400 font-normal w-14">Year</th>
                <th className="px-4 py-2.5 text-left text-slate-400 font-normal w-20 hidden sm:table-cell">Monitored</th>
                <th className="px-4 py-2.5 text-left text-slate-400 font-normal w-16 hidden md:table-cell">Files</th>
                <th className="px-4 py-2.5 text-left text-slate-400 font-normal w-24 hidden lg:table-cell">Size</th>
                <th className="px-4 py-2.5 text-left text-slate-400 font-normal hidden xl:table-cell">Profile</th>
                <th className="px-4 py-2.5 text-left text-slate-400 font-normal">Rules</th>
                <th className="px-4 py-2.5 text-left text-slate-400 font-normal hidden xl:table-cell">Added</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.id}
                  className={`border-b border-[#2a2a3a]/60 transition-colors ${
                    selectedIds.has(item.id) ? 'bg-[#1c1c28]/60' : 'hover:bg-white/5'
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="accent-indigo-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-white font-medium max-w-xs">
                    <span className="truncate block" title={item.title}>{item.title}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{item.year ?? '—'}</td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <span className={`inline-flex items-center gap-1 text-xs ${item.monitored ? 'text-green-400' : 'text-slate-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${item.monitored ? 'bg-green-400' : 'bg-slate-600'}`} />
                      {item.monitored ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <span className={`text-xs ${item.hasFile ? 'text-slate-300' : 'text-yellow-400'}`}>
                      {item.hasFile ? '✓' : 'Missing'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs hidden lg:table-cell">
                    {formatSize(item.sizeOnDisk)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs hidden xl:table-cell">
                    {item.qualityProfileName ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {item.assignedRules.length === 0 ? (
                      <span className="text-slate-600 text-xs italic">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {item.assignedRules.map(r => (
                          <span
                            key={r.id}
                            className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800"
                            title={`${r.action} after ${delayLabel(r)}`}
                          >
                            {r.name}
                            <button
                              onClick={() => handleUnassign(r.id, item.id)}
                              className="text-indigo-500 hover:text-red-400 leading-none ml-0.5"
                              title="Remove"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs hidden xl:table-cell whitespace-nowrap">
                    {formatDate(item.addedDate)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => openAssignFor([item])}
                      className="text-xs px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-white transition-colors"
                    >
                      Assign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── CARD VIEW ── */}
        {view === 'cards' && filtered.length > 0 && (
          <div className="p-4">
            {/* Card-view select-all */}
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400 hover:text-slate-200">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-indigo-500"
                />
                Select all ({filtered.length})
              </label>
              {selectedCount > 0 && (
                <span className="text-xs text-slate-500">{selectedCount} selected</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.map(item => (
                <LibraryCard
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleItem(item.id)}
                  onAssign={() => openAssignFor([item])}
                  onUnassign={handleUnassign}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Batch footer */}
      {selectedCount > 0 && (
        <footer className="sticky bottom-0 z-20 bg-[#1c1c28] border-t border-[#2a2a3a] px-6 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-slate-400">{selectedCount} selected</span>
          <button
            onClick={() => openAssignFor(filtered.filter(i => selectedIds.has(i.id)))}
            className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors"
          >
            Assign Rule…
          </button>
        </footer>
      )}

      {/* Assign / Create rule modal */}
      {assignOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={e => { if (e.target === e.currentTarget) setAssignOpen(false) }}
        >
          <div className="bg-[#1c1c28] rounded-xl w-full max-w-md mx-4 shadow-xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 pt-5 pb-3 shrink-0">
              <h2 className="text-white font-semibold">
                {assignTargetItems.length === 1 ? assignTargetItems[0].title : `${assignTargetItems.length} items`}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {assignTargetItems.length === 1 ? 'Assign or create a rule for this title' : `Assign or create a rule for ${assignTargetItems.length} selected items`}
              </p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#2a2a3a] shrink-0 px-5">
              {(['pick', 'create'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => { setModalMode(mode); setCreateError(null) }}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    modalMode === mode
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode === 'pick' ? 'Assign existing' : 'Create new'}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {modalMode === 'pick' && (
                <>
                  {compatibleRules.length === 0 ? (
                    <p className="text-slate-400 text-sm">
                      No compatible rules yet.{' '}
                      <button
                        className="text-indigo-400 hover:text-indigo-300 underline"
                        onClick={() => { setModalMode('create'); setCreateError(null) }}
                      >
                        Create one now
                      </button>
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {compatibleRules.map(r => (
                        <label
                          key={r.id}
                          className={`flex items-start gap-3 cursor-pointer p-3 rounded transition-colors ${
                            pickedRuleId === r.id ? 'bg-indigo-950 border border-indigo-700' : 'hover:bg-white/10'
                          }`}
                        >
                          <input
                            type="radio"
                            name="pickedRule"
                            value={r.id}
                            checked={pickedRuleId === r.id}
                            onChange={() => setPickedRuleId(r.id)}
                            className="mt-0.5 accent-indigo-500 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-white text-sm font-medium block">{r.name}</span>
                            <span className="text-slate-400 text-xs">
                              {r.action === 'delete' ? 'Delete' : 'Unmonitor'} after {delayLabel(r)}
                              {r.deleteFiles && r.action === 'delete' ? ' · with files' : ''}
                              {' · '}{r.targets.length === 0 ? 'No titles yet' : `${r.targets.length} title(s)`}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}

              {modalMode === 'create' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Creates a rule and assigns it to{' '}
                    {assignTargetItems.length === 1
                      ? <span className="text-slate-300">{assignTargetItems[0].title}</span>
                      : <span className="text-slate-300">{assignTargetItems.length} selected titles</span>
                    }.
                  </p>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Rule name</label>
                    <input
                      className="w-full bg-white/5 text-white text-sm rounded px-3 py-1.5 border border-white/10 focus:outline-none focus:border-indigo-500/60"
                      value={newRuleForm.name}
                      onChange={e => setNewRuleForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Delete after watching"
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Action</label>
                      <select
                        className="w-full bg-white/5 text-white text-sm rounded px-3 py-1.5 border border-white/10 focus:outline-none focus:border-indigo-500/60"
                        value={newRuleForm.action}
                        onChange={e => setNewRuleForm(f => ({ ...f, action: e.target.value as 'delete' | 'unmonitor' }))}
                      >
                        <option value="delete">Delete</option>
                        <option value="unmonitor">Unmonitor</option>
                      </select>
                    </div>

                    {target === 'series' && (
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Granularity</label>
                        <select
                          className="w-full bg-white/5 text-white text-sm rounded px-3 py-1.5 border border-white/10 focus:outline-none focus:border-indigo-500/60"
                          value={newRuleForm.granularity}
                          onChange={e => setNewRuleForm(f => ({ ...f, granularity: e.target.value as 'episode' | 'season' }))}
                        >
                          <option value="episode">Episode</option>
                          <option value="season">Season</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Delay</label>
                      <input
                        type="number"
                        min={1}
                        className="w-full bg-white/5 text-white text-sm rounded px-3 py-1.5 border border-white/10 focus:outline-none focus:border-indigo-500/60"
                        value={newRuleForm.delayAmount}
                        onChange={e => setNewRuleForm(f => ({ ...f, delayAmount: Math.max(1, Number(e.target.value)) }))}
                      />
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Unit</label>
                      <select
                        className="w-full bg-white/5 text-white text-sm rounded px-3 py-1.5 border border-white/10 focus:outline-none focus:border-indigo-500/60"
                        value={newRuleForm.delayUnit}
                        onChange={e => setNewRuleForm(f => ({ ...f, delayUnit: e.target.value as typeof DELAY_UNITS[number] }))}
                      >
                        {DELAY_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  {newRuleForm.action === 'delete' && (
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={newRuleForm.deleteFiles}
                        onChange={e => setNewRuleForm(f => ({ ...f, deleteFiles: e.target.checked }))}
                        className="accent-indigo-500"
                      />
                      Delete files from disk
                    </label>
                  )}

                  {createError && (
                    <p className="text-red-400 text-sm">{createError}</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 py-4 border-t border-[#2a2a3a] shrink-0">
              {modalMode === 'pick' ? (
                <>
                  <button
                    onClick={handleAssign}
                    disabled={!pickedRuleId || assigning || compatibleRules.length === 0}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 rounded text-white disabled:opacity-50 transition-colors"
                  >
                    {assigning && <Spinner className="w-3.5 h-3.5" />}
                    {assigning ? 'Assigning…' : 'Assign'}
                  </button>
                  <button
                    onClick={() => setAssignOpen(false)}
                    className="px-4 py-1.5 text-sm bg-white/5 hover:bg-white/10 rounded text-white transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleCreateAndAssign}
                    disabled={creating || !newRuleForm.name.trim()}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 rounded text-white disabled:opacity-50 transition-colors"
                  >
                    {creating && <Spinner className="w-3.5 h-3.5" />}
                    {creating ? 'Creating…' : 'Create & Assign'}
                  </button>
                  <button
                    onClick={() => setAssignOpen(false)}
                    className="px-4 py-1.5 text-sm bg-white/5 hover:bg-white/10 rounded text-white transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1c1c28] border border-[#2a2a3a] text-white text-sm px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
