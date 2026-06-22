'use client'
import { useState } from 'react'
import { Spinner } from './Spinner'
import type { useSettings } from '@/hooks/useSettings'

type SettingsHook = ReturnType<typeof useSettings>

interface ServiceFieldsProps {
  label: string
  name: 'radarr' | 'sonarr'
  url: string
  apiKey: string
  onUrlChange: (v: string) => void
  onApiKeyChange: (v: string) => void
  onTest: () => Promise<{ ok: boolean; version?: string; error?: string }>
  testing: boolean
}

function ServiceFields({ label, name, url, apiKey, onUrlChange, onApiKeyChange, onTest, testing }: ServiceFieldsProps) {
  const [result, setResult] = useState<{ ok: boolean; version?: string; error?: string } | null>(null)

  const handleTest = async () => {
    setResult(null)
    const r = await onTest()
    setResult(r)
  }

  const input = 'w-full rounded bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500'

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wide">{label}</h3>
      <div>
        <label className="block text-xs text-slate-400 mb-1">URL</label>
        <input
          value={url}
          onChange={e => { onUrlChange(e.target.value); setResult(null) }}
          placeholder={name === 'radarr' ? 'http://radarr:7878' : 'http://sonarr:8989'}
          className={input}
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => { onApiKeyChange(e.target.value); setResult(null) }}
          placeholder="Paste your API key"
          className={input}
        />
      </div>
      <button
        onClick={handleTest}
        disabled={!url || !apiKey || testing}
        className="rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-xs transition-colors"
      >
        {testing ? 'Testing…' : 'Test Connection'}
      </button>
      {result && (
        <p className={`text-xs ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
          {result.ok ? `✓ Connected — v${result.version}` : `✗ ${result.error}`}
        </p>
      )}
    </div>
  )
}

interface Props {
  hook: SettingsHook
  onComplete: () => void
}

export function SetupScreen({ hook, onComplete }: Props) {
  const [radarrUrl, setRadarrUrl] = useState('')
  const [radarrKey, setRadarrKey] = useState('')
  const [sonarrUrl, setSonarrUrl] = useState('')
  const [sonarrKey, setSonarrKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    const hasRadarr = radarrUrl && radarrKey
    const hasSonarr = sonarrUrl && sonarrKey
    if (!hasRadarr && !hasSonarr) {
      setError('Configure at least one service to continue.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await hook.saveSettings({
        ...(hasRadarr ? { radarr: { url: radarrUrl, apiKey: radarrKey } } : {}),
        ...(hasSonarr ? { sonarr: { url: sonarrUrl, apiKey: sonarrKey } } : {}),
      })
      await Promise.all([
        hasRadarr ? hook.refreshCache('radarr') : Promise.resolve(),
        hasSonarr ? hook.refreshCache('sonarr') : Promise.resolve(),
      ])
      onComplete()
    } catch {
      setError('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const makeTestFn = (service: 'radarr' | 'sonarr', url: string, apiKey: string) => async () => {
    await hook.saveSettings({ [service]: { url, apiKey } })
    return hook.testConnection(service)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md rounded-xl bg-slate-800 border border-slate-700 shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-700">
          <h1 className="text-xl font-bold text-orange-500">Welcome to Bulkarr</h1>
          <p className="text-sm text-slate-400 mt-1">Connect at least one service to get started.</p>
        </div>

        <div className="px-6 py-5 space-y-6">
          <ServiceFields
            label="Radarr"
            name="radarr"
            url={radarrUrl}
            apiKey={radarrKey}
            onUrlChange={setRadarrUrl}
            onApiKeyChange={setRadarrKey}
            onTest={makeTestFn('radarr', radarrUrl, radarrKey)}
            testing={hook.testing === 'radarr'}
          />
          <hr className="border-slate-700" />
          <ServiceFields
            label="Sonarr"
            name="sonarr"
            url={sonarrUrl}
            apiKey={sonarrKey}
            onUrlChange={setSonarrUrl}
            onApiKeyChange={setSonarrKey}
            onTest={makeTestFn('sonarr', sonarrUrl, sonarrKey)}
            testing={hook.testing === 'sonarr'}
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-50 py-2 font-semibold text-sm transition-colors"
          >
            {saving && <Spinner className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save & Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
