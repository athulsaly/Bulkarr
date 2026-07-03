'use client'
import Image from 'next/image'
import type { LibraryItemFull, AutoDeleteRule } from '@/lib/types'

function delayLabel(r: AutoDeleteRule): string {
  return r.delayUnit === 'year' ? '1 year' : `${r.delayAmount} ${r.delayUnit}`
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}

interface Props {
  item: LibraryItemFull
  selected: boolean
  onToggleSelect: () => void
  onAssign: () => void
  onUnassign: (ruleId: string, arrId: number) => void
}

export function LibraryCard({ item, selected, onToggleSelect, onAssign, onUnassign }: Props) {
  return (
    <div
      className={`flex flex-col rounded-lg bg-slate-800 overflow-hidden border transition-colors ${
        selected ? 'border-orange-500' : 'border-slate-700'
      }`}
    >
      {/* Poster */}
      <div className="relative bg-slate-700" style={{ aspectRatio: '2/3' }}>
        {item.posterUrl ? (
          <Image
            src={item.posterUrl}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
            <span className="text-4xl font-bold">{item.title.charAt(0).toUpperCase()}</span>
            <span className="text-xs mt-1">No poster</span>
          </div>
        )}

        <label className="absolute top-2 left-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="w-4 h-4 accent-orange-500"
          />
        </label>

        <span
          className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-900/50 ${
            item.monitored ? 'bg-green-400' : 'bg-slate-500'
          }`}
          title={item.monitored ? 'Monitored' : 'Unmonitored'}
        />

        {!item.hasFile && (
          <span className="absolute bottom-2 left-2 text-xs bg-yellow-800/90 text-yellow-200 px-1.5 py-0.5 rounded">
            Missing
          </span>
        )}

        {item.sizeOnDisk > 0 && (
          <span className="absolute bottom-2 right-2 text-xs bg-slate-900/80 text-slate-300 px-1.5 py-0.5 rounded">
            {formatSize(item.sizeOnDisk)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-2 space-y-1.5 flex-1 flex flex-col">
        <p className="text-sm font-medium leading-tight truncate text-white" title={item.title}>
          {item.title}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          {item.year && <span>{item.year}</span>}
          {item.qualityProfileName && (
            <>
              <span className="text-slate-600">·</span>
              <span className="truncate">{item.qualityProfileName}</span>
            </>
          )}
        </div>

        {/* Assigned rules */}
        {item.assignedRules.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.assignedRules.map(r => (
              <span
                key={r.id}
                className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800"
                title={`${r.action} after ${delayLabel(r)}`}
              >
                {r.name}
                <button
                  onClick={() => onUnassign(r.id, item.id)}
                  className="text-indigo-500 hover:text-red-400 leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-1">
          <button
            onClick={onAssign}
            className="w-full text-xs py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-white transition-colors"
          >
            Assign Rule
          </button>
        </div>
      </div>
    </div>
  )
}
