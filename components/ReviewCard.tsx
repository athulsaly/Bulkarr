'use client'
import Image from 'next/image'
import type { ReviewRow, DefaultsConfig, Cache } from '@/lib/types'
import { MatchPicker } from './MatchPicker'

interface Props {
  row: ReviewRow
  defaults: DefaultsConfig
  cache: Cache
  target: 'movies' | 'series'
  onUpdate: (patch: Partial<ReviewRow>) => void
  onDelete: () => void
}

const STATUS_CLASSES: Record<ReviewRow['status'], string> = {
  pending:    'bg-slate-700 text-slate-300',
  matched:    'bg-blue-800 text-blue-200',
  no_match:   'bg-red-900 text-red-300',
  in_library: 'bg-yellow-800 text-yellow-200',
  added:      'bg-green-800 text-green-200',
  failed:     'bg-red-900 text-red-300',
}

const STATUS_LABEL: Record<ReviewRow['status'], string> = {
  pending:    'Pending',
  matched:    'Matched',
  no_match:   'No Match',
  in_library: 'In Library',
  added:      'Added',
  failed:     'Failed',
}

export function ReviewCard({ row, defaults, cache, target, onUpdate, onDelete }: Props) {
  const match = row.candidates[row.selectedIndex]
  const profiles = (target === 'movies' ? cache.radarr?.profiles : cache.sonarr?.profiles) ?? []
  const rootFolders = (target === 'movies' ? cache.radarr?.rootFolders : cache.sonarr?.rootFolders) ?? []
  const sel = 'w-full text-xs rounded bg-slate-700 border border-slate-600 px-1.5 py-1 focus:outline-none focus:border-orange-500'

  return (
    <div className={`flex flex-col rounded-lg bg-slate-800 border overflow-hidden transition-opacity ${row.included ? 'border-slate-600' : 'border-slate-700/50 opacity-50'}`}>
      {/* Poster */}
      <div className="relative bg-slate-700" style={{ aspectRatio: '2/3' }}>
        {match?.remotePoster ? (
          <Image
            src={match.remotePoster}
            alt={match.title}
            fill
            sizes="160px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-600">
            <span className="text-3xl font-bold">{(match?.title ?? row.inputText).charAt(0).toUpperCase()}</span>
            <span className="text-xs">No poster</span>
          </div>
        )}

        {/* Checkbox top-left */}
        <label className="absolute top-2 left-2 cursor-pointer">
          <input
            type="checkbox"
            checked={row.included}
            onChange={e => onUpdate({ included: e.target.checked })}
            className="w-4 h-4 accent-orange-500"
          />
        </label>

        {/* Status badge top-right */}
        <span className={`absolute top-2 right-2 text-xs rounded-full px-2 py-0.5 font-medium shadow ${STATUS_CLASSES[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>

        {/* Delete bottom-right */}
        <button
          onClick={onDelete}
          className="absolute bottom-2 right-2 bg-slate-900/70 hover:bg-red-900/80 text-slate-400 hover:text-white rounded px-1.5 py-0.5 text-xs leading-none transition-colors"
        >
          ×
        </button>
      </div>

      {/* Info */}
      <div className="p-2 space-y-1.5 flex-1">
        <p className="text-sm font-medium leading-tight truncate" title={match?.title ?? row.inputText}>
          {match?.title ?? <span className="text-red-400">{row.inputText}</span>}
        </p>
        {match?.year ? <p className="text-xs text-slate-500">{match.year}</p> : null}

        {row.candidates.length > 1 && (
          <MatchPicker
            candidates={row.candidates}
            selectedIndex={row.selectedIndex}
            onChange={i => onUpdate({ selectedIndex: i })}
            className="w-full text-xs rounded bg-slate-700 border border-slate-600 px-1.5 py-0.5 focus:outline-none focus:border-orange-500"
          />
        )}

        {(row.status === 'failed' || row.status === 'no_match') && row.errorMessage && (
          <p className="text-red-400 text-xs truncate" title={row.errorMessage}>{row.errorMessage}</p>
        )}

        {/* Per-row overrides */}
        {profiles.length > 0 && (
          <select
            value={row.overrides.qualityProfileId ?? defaults.qualityProfileId}
            onChange={e => onUpdate({ overrides: { ...row.overrides, qualityProfileId: Number(e.target.value) } })}
            className={sel}
          >
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {rootFolders.length > 0 && (
          <select
            value={row.overrides.rootFolderPath ?? defaults.rootFolderPath}
            onChange={e => onUpdate({ overrides: { ...row.overrides, rootFolderPath: e.target.value } })}
            className={sel}
          >
            {rootFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}
