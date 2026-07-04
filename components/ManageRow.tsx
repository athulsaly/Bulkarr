'use client'
import type { ManageRow as IManageRow } from '@/lib/types'
import { MatchPicker } from './MatchPicker'
import type { ArrItem } from '@/lib/types'

interface Props {
  row: IManageRow
  selected: boolean
  onToggleSelect: () => void
  onUpdate: (patch: Partial<IManageRow>) => void
  onDelete: () => void
  style?: React.CSSProperties
}

const STATUS_CLASSES: Record<IManageRow['status'], string> = {
  pending:  'bg-white/10 text-slate-300',
  matched:  'bg-blue-800 text-blue-200',
  no_match: 'bg-red-900 text-red-300',
  done:     'bg-green-800 text-green-200',
  failed:   'bg-red-900 text-red-300',
}

const STATUS_LABEL: Record<IManageRow['status'], string> = {
  pending:  'Pending',
  matched:  'Matched',
  no_match: 'No Match',
  done:     'Done',
  failed:   'Failed',
}

export function ManageRowComponent({ row, selected, onToggleSelect, onUpdate, onDelete, style }: Props) {
  const match = row.libraryMatches[row.selectedIndex]
  const candidatesAsArrItems = row.libraryMatches as unknown as ArrItem[]

  return (
    <div style={style} className="flex items-center gap-2 px-4 py-2 border-b border-[#2a2a3a] hover:bg-white/5 text-sm">
      <input
        type="checkbox"
        checked={selected}
        disabled={row.status !== 'matched'}
        onChange={onToggleSelect}
        className="accent-indigo-500 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      />

      <span className="w-36 shrink-0 truncate text-slate-300 text-xs" title={row.inputText}>
        {row.inputText}
      </span>

      <div className="flex-1 min-w-0">
        {match ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{match.title}</span>
            <MatchPicker
              candidates={candidatesAsArrItems}
              selectedIndex={row.selectedIndex}
              onChange={i => onUpdate({ selectedIndex: i })}
            />
          </div>
        ) : (
          <span className="text-red-400 text-xs">No match in library</span>
        )}
        {row.status === 'failed' && row.errorMessage && (
          <p className="text-red-400 text-xs mt-0.5 truncate" title={row.errorMessage}>{row.errorMessage}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_CLASSES[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>

        {row.status === 'matched' && (
          <select
            value={row.action}
            onChange={e => onUpdate({ action: e.target.value as IManageRow['action'] })}
            className="text-xs rounded bg-white/5 border border-white/10 px-1.5 py-0.5 focus:outline-none"
          >
            <option value="remove">Remove</option>
            <option value="unmonitor">Unmonitor</option>
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
