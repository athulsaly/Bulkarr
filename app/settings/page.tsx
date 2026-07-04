'use client'
import { useState, useEffect } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { useToast } from '@/hooks/useToast'
import { Spinner } from '@/components/Spinner'
import { ToastStack } from '@/components/ToastStack'
import type { useSettings as UseSettingsType } from '@/hooks/useSettings'

type SettingsHook = ReturnType<typeof UseSettingsType>

const inp = 'w-full rounded-lg bg-white/5 border border-[#2a2a3a] px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60'

function ArrSection({ name, label, hook, onToast }: { name: 'radarr' | 'sonarr'; label: string; hook: SettingsHook; onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void }) {
  const existing = hook.settings[name]
  const [url, setUrl] = useState(existing?.url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; version?: string; error?: string } | null>(null)

  useEffect(() => { setUrl(existing?.url ?? ''); setApiKey('') }, [existing?.url])

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

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wide">{label}</h3>
      <div>
        <label className="block text-xs text-slate-400 mb-1">URL</label>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder={name === 'radarr' ? 'http://radarr:7878' : 'http://sonarr:8989'} className={inp} />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">API Key {existing ? <span className="text-slate-600">(leave blank to keep current)</span> : null}</label>
        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={existing ? '••••••••' : 'Enter API key'} className={inp} />
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-sm font-medium transition-colors">Save</button>
        <button onClick={handleTest} disabled={hook.testing === name} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 px-3 py-1.5 text-sm transition-colors disabled:opacity-50">
          {hook.testing === name && <Spinner className="w-3.5 h-3.5" />}
          {hook.testing === name ? 'Testing…' : 'Test'}
        </button>
      </div>
      {testResult && <p className={`text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>{testResult.ok ? `✓ Connected — v${testResult.version}` : `✗ ${testResult.error}`}</p>}
    </div>
  )
}

function TmdbSection({ hook, onToast }: { hook: SettingsHook; onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void }) {
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
        <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wide">TMDB</h3>
        {configured && <span className="text-xs text-green-400">✓ Poster view on</span>}
      </div>
      <p className="text-xs text-slate-500">Add a TMDB API key to switch search results to a poster card layout.</p>
      <div>
        <label className="block text-xs text-slate-400 mb-1">API Key {configured ? <span className="text-slate-600">(leave blank to keep current)</span> : null}</label>
        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={configured ? '••••••••' : 'Enter TMDB API key'} className={inp} />
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={!apiKey} className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-sm font-medium transition-colors">Save</button>
        {configured && <button onClick={handleClear} className="rounded-lg bg-white/5 hover:bg-white/10 px-3 py-1.5 text-sm transition-colors">Remove</button>}
      </div>
    </div>
  )
}

function MediaServerSection({ name, label, placeholder, hook, onToast }: { name: 'jellyfin' | 'plex'; label: string; placeholder: string; hook: SettingsHook; onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void }) {
  const existing = hook.settings[name]
  const [url, setUrl] = useState(existing?.url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => { setUrl(existing?.url ?? ''); setApiKey('') }, [existing?.url])
  useEffect(() => { setOrigin(window.location.origin) }, [])

  const handleSave = async () => {
    const config = apiKey ? { url, apiKey } : { url, apiKey: existing?.apiKey ?? '' }
    await hook.saveSettings({ [name]: config } as Parameters<typeof hook.saveSettings>[0])
    onToast(`${label} settings saved`, 'success')
  }

  const handleTest = async () => {
    setTestLoading(true)
    try {
      const r = await fetch('/api/settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: name, url: url || undefined, apiKey: apiKey || undefined }) }).then(r => r.json()) as { ok: boolean; error?: string }
      setTestResult(r)
      if (!r.ok) onToast(`${label} connection failed: ${r.error}`, 'error')
    } finally {
      setTestLoading(false)
    }
  }

  const webhookUrl = `${origin}/api/webhook/${name}`

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wide">{label}</h3>
      <div>
        <label className="block text-xs text-slate-400 mb-1">URL</label>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder={placeholder} className={inp} />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">{name === 'plex' ? 'Plex Token' : 'API Key'}{' '}{existing ? <span className="text-slate-600">(leave blank to keep current)</span> : null}</label>
        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={existing ? '••••••••' : `Enter ${name === 'plex' ? 'Plex token' : 'API key'}`} className={inp} />
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-sm font-medium transition-colors">Save</button>
        <button
          onClick={handleTest}
          disabled={testLoading}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
        >
          {testLoading && <Spinner className="w-3.5 h-3.5" />}
          {testLoading ? 'Testing…' : 'Test'}
        </button>
      </div>
      {testResult && <p className={`text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>{testResult.ok ? '✓ Connected' : `✗ ${testResult.error}`}</p>}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Webhook URL</label>
        <div className="flex gap-1.5">
          <input readOnly value={webhookUrl} className="flex-1 rounded-lg bg-[#0f0f12] px-2 py-1 text-xs text-slate-400 border border-[#2a2a3a] focus:outline-none" />
          <button onClick={() => navigator.clipboard.writeText(webhookUrl).then(() => onToast('Copied', 'info'))} className="rounded-lg bg-white/5 hover:bg-white/10 px-2 py-1 text-xs transition-colors">Copy</button>
        </div>
      </div>
    </div>
  )
}

function MediaGlobalSection({ hook, onToast }: { hook: SettingsHook; onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void }) {
  const cfg = hook.settings.mediaServer
  const [pollInterval, setPollInterval] = useState(String(cfg.pollIntervalMinutes))
  const [threshold, setThreshold] = useState(String(cfg.watchedThresholdPct))

  const handleSave = async () => {
    await hook.saveSettings({ mediaServer: { pollIntervalMinutes: Number(pollInterval), watchedThresholdPct: Number(threshold) } })
    onToast('Media server settings saved', 'success')
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Polling &amp; Threshold</h3>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1">Poll interval</label>
          <select value={pollInterval} onChange={e => setPollInterval(e.target.value)} className="w-full rounded-lg bg-white/5 border border-[#2a2a3a] px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60">
            {[5, 15, 30, 60].map(v => <option key={v} value={v}>{v} min</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1">Watched threshold</label>
          <select value={threshold} onChange={e => setThreshold(e.target.value)} className="w-full rounded-lg bg-white/5 border border-[#2a2a3a] px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/60">
            {[70, 75, 80, 85, 90, 95, 100].map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </div>
      </div>
      <button onClick={handleSave} className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-sm font-medium transition-colors">Save</button>
    </div>
  )
}

export default function SettingsPage() {
  const hook = useSettings()
  const { toasts, addToast, dismiss } = useToast()

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <h1 className="text-xl font-bold text-slate-100">Settings</h1>

      <div className="rounded-xl border border-[#2a2a3a] bg-[#1c1c28] p-5 space-y-6">
        <ArrSection name="radarr" label="Radarr" hook={hook} onToast={addToast} />
        <hr className="border-[#2a2a3a]" />
        <ArrSection name="sonarr" label="Sonarr" hook={hook} onToast={addToast} />
      </div>

      <div className="rounded-xl border border-[#2a2a3a] bg-[#1c1c28] p-5 space-y-6">
        <TmdbSection hook={hook} onToast={addToast} />
      </div>

      <div className="rounded-xl border border-[#2a2a3a] bg-[#1c1c28] p-5 space-y-6">
        <MediaServerSection name="jellyfin" label="Jellyfin" placeholder="http://jellyfin:8096" hook={hook} onToast={addToast} />
        <hr className="border-[#2a2a3a]" />
        <MediaServerSection name="plex" label="Plex" placeholder="http://plex:32400" hook={hook} onToast={addToast} />
        <hr className="border-[#2a2a3a]" />
        <MediaGlobalSection hook={hook} onToast={addToast} />
      </div>

      <div className="rounded-xl border border-[#2a2a3a] bg-[#1c1c28] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Cache</h2>
        <p className="text-xs text-slate-500">Refresh the local cache of quality profiles, root folders, and library contents from Radarr and Sonarr.</p>
        <div className="flex gap-3">
          <button
            onClick={() => hook.refreshCache('radarr').then(r => r.ok ? addToast('Radarr cache refreshed', 'success') : addToast(`Cache refresh failed: ${r.error}`, 'error'))}
            disabled={hook.refreshing === 'radarr'}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-[#2a2a3a] px-3 py-2 text-sm text-slate-300 transition-colors disabled:opacity-50"
          >
            {hook.refreshing === 'radarr' && <Spinner className="w-3.5 h-3.5" />}
            {hook.refreshing === 'radarr' ? 'Refreshing…' : 'Refresh Radarr'}
          </button>
          <button
            onClick={() => hook.refreshCache('sonarr').then(r => r.ok ? addToast('Sonarr cache refreshed', 'success') : addToast(`Cache refresh failed: ${r.error}`, 'error'))}
            disabled={hook.refreshing === 'sonarr'}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-[#2a2a3a] px-3 py-2 text-sm text-slate-300 transition-colors disabled:opacity-50"
          >
            {hook.refreshing === 'sonarr' && <Spinner className="w-3.5 h-3.5" />}
            {hook.refreshing === 'sonarr' ? 'Refreshing…' : 'Refresh Sonarr'}
          </button>
        </div>
      </div>

      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
