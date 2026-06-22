'use client'
import type { ReviewRow as IReviewRow, DefaultsConfig, Cache } from '@/lib/types'
import { MatchPicker } from './MatchPicker'

interface Props {
  row: IReviewRow
  defaults: DefaultsConfig
  cache: Cache
  target: 'movies' | 'series'
  onUpdate: (patch: Partial<IReviewRow>) => void
  onDelete: () => void
  style?: React.CSSProperties
}

const STATUS_CLASSES: Record<IReviewRow['status'], string> = {
  pending:    'bg-slate-700 text-slate-300',
  matched:    'bg-blue-800 text-blue-200',
  no_match:   'bg-red-900 text-red-300',
  in_library: 'bg-yellow-800 text-yellow-200',
  added:      'bg-green-800 text-green-200',
  failed:     'bg-red-900 text-red-300',
}

const STATUS_LABEL: Record<IReviewRow['status'], string> = {
  pending:    'Pending',
  matched:    'Matched',
  no_match:   'No Match',
  in_library: 'In Library',
  added:      'Added',
  failed:     'Failed',
}

export function ReviewRowComponent({ row, defaults, cache, target, onUpdate, onDelete, style }: Props) {
  const match = row.candidates[row.selectedIndex]
  const profiles = (target === 'movies' ? cache.radarr?.profiles : cache.sonarr?.profiles) ?? []
  const rootFolders = (target === 'movies' ? cache.radarr?.rootFolders : cache.sonarr?.rootFolders) ?? []
  const sel = 'text-xs rounded bg-slate-700 border border-slate-600 px-1.5 py-0.5 focus:outline-none'

  return (
    <div style={style} className="flex items-start gap-2 px-4 py-2 border-b border-slate-800 hover:bg-slate-800/50 text-sm">
      <input
        type="checkbox"
        checked={row.included}
        onChange={e => onUpdate({ included: e.target.checked })}
        className="mt-1 accent-orange-500 shrink-0"
      />

      <span className="w-36 shrink-0 truncate text-slate-300 text-xs" title={row.inputText}>
        {row.inputText}
      </span>

      <div className="flex-1 min-w-0">
        {match ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{match.title}</span>
            {match.year ? <span className="text-slate-500 text-xs">({match.year})</span> : null}
            <MatchPicker
              candidates={row.candidates}
              selectedIndex={row.selectedIndex}
              onChange={i => onUpdate({ selectedIndex: i })}
            />
          </div>
        ) : (
          <span className="text-red-400 text-xs">No match</span>
        )}
        {(row.status === 'failed' || row.status === 'no_match') && row.errorMessage && (
          <p className="text-red-400 text-xs mt-0.5 truncate" title={row.errorMessage}>{row.errorMessage}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_CLASSES[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>

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

        <button
          onClick={onDelete}
          className="text-slate-600 hover:text-red-400 text-sm leading-none transition-colors"
          title="Remove row"
        >
          ×
        </button>
      </div>
    </div>
  )
}
