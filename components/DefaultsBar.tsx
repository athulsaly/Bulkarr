'use client'
import type { DefaultsConfig, Cache } from '@/lib/types'

interface Props {
  target: 'movies' | 'series'
  onTargetChange: (t: 'movies' | 'series') => void
  activeMode: 'add' | 'manage'
  onModeChange: (m: 'add' | 'manage') => void
  defaults: DefaultsConfig
  onDefaultsChange: (patch: Partial<DefaultsConfig>) => void
  cache: Cache
}

export function DefaultsBar({ target, onTargetChange, activeMode, onModeChange, defaults, onDefaultsChange, cache }: Props) {
  const profiles = (target === 'movies' ? cache.radarr?.profiles : cache.sonarr?.profiles) ?? []
  const rootFolders = (target === 'movies' ? cache.radarr?.rootFolders : cache.sonarr?.rootFolders) ?? []

  const sel = 'rounded bg-slate-700 border border-slate-600 px-2 py-1 text-sm focus:outline-none focus:border-orange-500'

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-slate-800 border-b border-slate-700 text-sm">
      {/* Movies / Series tab */}
      <div className="flex rounded overflow-hidden border border-slate-600">
        {(['movies', 'series'] as const).map(t => (
          <button
            key={t}
            onClick={() => onTargetChange(t)}
            className={`px-3 py-1 text-xs font-medium transition-colors ${target === t ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            {t === 'movies' ? 'Movies' : 'Series'}
          </button>
        ))}
      </div>

      {/* Add / Manage mode toggle */}
      <div className="flex rounded overflow-hidden border border-slate-600">
        {(['add', 'manage'] as const).map(m => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`px-3 py-1 text-xs font-medium transition-colors capitalize ${activeMode === m ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            {m === 'add' ? 'Add' : 'Manage'}
          </button>
        ))}
      </div>

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
              className="accent-orange-500"
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
              className="accent-orange-500"
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
                  className="accent-orange-500"
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
