'use client'
import { useState, useEffect } from 'react'
import type { Settings } from '@/lib/types'
import type { useSettings } from '@/hooks/useSettings'

type SettingsHook = ReturnType<typeof useSettings>

interface Props {
  open: boolean
  onClose: () => void
  hook: SettingsHook
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void
}

function ServiceSection({
  name, label, hook, onToast,
}: { name: 'radarr' | 'sonarr'; label: string; hook: SettingsHook; onToast: Props['onToast'] }) {
  const existing = hook.settings[name]
  const [url, setUrl] = useState(existing?.url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; version?: string; error?: string } | null>(null)

  useEffect(() => {
    setUrl(existing?.url ?? '')
    setApiKey('')
  }, [existing?.url])

  const handleSave = async () => {
    const config = apiKey ? { url, apiKey } : { url, apiKey: existing?.apiKey ?? '' }
    await hook.saveSettings({ [name]: config })
    onToast(`${label} settings saved`, 'success')
  }

  const handleTest = async () => {
    const r = await hook.testConnection(name)
    setTestResult(r)
    if (!r.ok) onToast(`${label} connection failed: ${r.error}`, 'error')
  }

  const handleRefreshCache = async () => {
    const r = await hook.refreshCache(name)
    if (r.ok) onToast(`${label} cache refreshed`, 'success')
    else onToast(`Cache refresh failed: ${r.error}`, 'error')
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wide">{label}</h3>
      <div>
        <label className="block text-xs text-slate-400 mb-1">URL</label>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="http://radarr:7878"
          className="w-full rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-100 border border-slate-600 focus:outline-none focus:border-orange-500"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          API Key {existing ? <span className="text-slate-500">(leave blank to keep current)</span> : null}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={existing ? '••••••••' : 'Enter API key'}
          className="w-full rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-100 border border-slate-600 focus:outline-none focus:border-orange-500"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 rounded bg-orange-600 hover:bg-orange-500 px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Save
        </button>
        <button
          onClick={handleTest}
          disabled={hook.testing === name}
          className="flex-1 rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
        >
          {hook.testing === name ? 'Testing…' : 'Test'}
        </button>
      </div>
      {testResult && (
        <p className={`text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
          {testResult.ok ? `✓ Connected — v${testResult.version}` : `✗ ${testResult.error}`}
        </p>
      )}
      <button
        onClick={handleRefreshCache}
        disabled={hook.refreshing === name}
        className="w-full rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 text-xs text-slate-400 transition-colors disabled:opacity-50"
      >
        {hook.refreshing === name ? 'Refreshing cache…' : 'Refresh Cache'}
      </button>
    </div>
  )
}

function TmdbSection({ hook, onToast }: { hook: SettingsHook; onToast: Props['onToast'] }) {
  const configured = !!hook.settings.tmdbApiKey
  const [apiKey, setApiKey] = useState('')

  const handleSave = async () => {
    await hook.saveSettings({ tmdbApiKey: apiKey })
    setApiKey('')
    onToast('TMDB API key saved — poster card view enabled', 'success')
  }

  const handleClear = async () => {
    await hook.saveSettings({ tmdbApiKey: '' })
    onToast('TMDB API key removed', 'info')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wide">TMDB</h3>
        {configured && <span className="text-xs text-green-400">✓ Poster view on</span>}
      </div>
      <p className="text-xs text-slate-500">Add a TMDB API key to switch search results to a poster card layout.</p>
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          API Key {configured ? <span className="text-slate-500">(leave blank to keep current)</span> : null}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={configured ? '••••••••' : 'Enter TMDB API key'}
          className="w-full rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-100 border border-slate-600 focus:outline-none focus:border-orange-500"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!apiKey}
          className="flex-1 rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-sm font-medium transition-colors"
        >
          Save
        </button>
        {configured && (
          <button onClick={handleClear} className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm transition-colors">
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

export function SettingsDrawer({ open, onClose, hook, onToast }: Props) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} />}
      <div className={`fixed top-0 right-0 z-40 h-full w-80 bg-slate-800 border-l border-slate-700 shadow-xl transform transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <span className="font-semibold text-sm">Settings</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-3rem)] p-4 space-y-6">
          <ServiceSection name="radarr" label="Radarr" hook={hook} onToast={onToast} />
          <hr className="border-slate-700" />
          <ServiceSection name="sonarr" label="Sonarr" hook={hook} onToast={onToast} />
          <hr className="border-slate-700" />
          <TmdbSection hook={hook} onToast={onToast} />
        </div>
      </div>
    </>
  )
}
