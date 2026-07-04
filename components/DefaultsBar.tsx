'use client'
import type { DefaultsConfig, Cache } from '@/lib/types'

interface Props {
  target: 'movies' | 'series'
  onTargetChange?: (t: 'movies' | 'series') => void
  activeMode?: 'add' | 'manage'
  onModeChange?: (m: 'add' | 'manage') => void
  defaults: DefaultsConfig
  onDefaultsChange: (patch: Partial<DefaultsConfig>) => void
  cache: Cache
}

export function DefaultsBar({ target, onTargetChange, activeMode = 'add', onModeChange, defaults, onDefaultsChange, cache }: Props) {
  const profiles = (target === 'movies' ? cache.radarr?.profiles : cache.sonarr?.profiles) ?? []
  const rootFolders = (target === 'movies' ? cache.radarr?.rootFolders : cache.sonarr?.rootFolders) ?? []

  const sel = 'rounded bg-[#1c1c28] border border-[#2a2a3a] px-2 py-1 text-sm focus:outline-none focus:border-indigo-500 text-slate-200'

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-[#161620] border-b border-[#2a2a3a] text-sm shrink-0">
      {/* Movies / Series tab — only when caller provides handler */}
      {onTargetChange && (
        <div className="flex rounded overflow-hidden border border-[#2a2a3a]">
          {(['movies', 'series'] as const).map(t => (
            <button
              key={t}
              onClick={() => onTargetChange(t)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${target === t ? 'bg-indigo-600 text-white' : 'bg-[#1c1c28] text-slate-400 hover:text-white'}`}
            >
              {t === 'movies' ? 'Movies' : 'Series'}
            </button>
          ))}
        </div>
      )}

      {/* Add / Manage mode toggle — only when caller provides handler */}
      {onModeChange && (
        <div className="flex rounded overflow-hidden border border-[#2a2a3a]">
          {(['add', 'manage'] as const).map(m => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`px-3 py-1 text-xs font-medium transition-colors capitalize ${activeMode === m ? 'bg-[#2a2a3a] text-white' : 'bg-[#1c1c28] text-slate-400 hover:text-white'}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Add-mode-only controls */}
      {activeMode === 'add' && (
        <>
          <select
            value={defaults.qualityProfileId}
            onChange={e => onDefaultsChange({ qualityProfileId: Number(e.target.value) })}
            className={sel}
          >
            <option value={0}>Quality Profile</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select
            value={defaults.rootFolderPath}
            onChange={e => onDefaultsChange({ rootFolderPath: e.target.value })}
            className={sel}
          >
            <option value="">Root Folder</option>
            {rootFolders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
          </select>

          <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={defaults.monitored}
              onChange={e => onDefaultsChange({ monitored: e.target.checked })}
              className="accent-indigo-500"
            />
            Monitored
          </label>

          {target === 'movies' && (
            <select
              value={defaults.minimumAvailability ?? 'released'}
              onChange={e => onDefaultsChange({ minimumAvailability: e.target.value as DefaultsConfig['minimumAvailability'] })}
              className={sel}
            >
              <option value="announced">Announced</option>
              <option value="inCinemas">In Cinemas</option>
              <option value="released">Released</option>
            </select>
          )}

          <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={defaults.searchOnAdd}
              onChange={e => onDefaultsChange({ searchOnAdd: e.target.checked })}
              className="accent-indigo-500"
            />
            Search on Add
          </label>

          {target === 'series' && (
            <>
              <select
                value={defaults.seriesType ?? 'standard'}
                onChange={e => onDefaultsChange({ seriesType: e.target.value as DefaultsConfig['seriesType'] })}
                className={sel}
              >
                <option value="standard">Standard</option>
                <option value="anime">Anime</option>
                <option value="daily">Daily</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={defaults.seasonFolder ?? true}
                  onChange={e => onDefaultsChange({ seasonFolder: e.target.checked })}
                  className="accent-indigo-500"
                />
                Season Folder
              </label>
            </>
          )}
        </>
      )}
    </div>
  )
}
