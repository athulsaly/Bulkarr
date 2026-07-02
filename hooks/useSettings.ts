'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Settings, Cache } from '@/lib/types'

interface SettingsState {
  settings: Settings
  cache: Cache
  loading: boolean
  testing: 'radarr' | 'sonarr' | 'jellyfin' | 'plex' | null
  refreshing: 'radarr' | 'sonarr' | null
}

interface SettingsActions {
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  testConnection: (service: 'radarr' | 'sonarr' | 'jellyfin' | 'plex') => Promise<{ ok: boolean; version?: string; error?: string }>
  refreshCache: (service: 'radarr' | 'sonarr') => Promise<{ ok: boolean; error?: string }>
}

const DEFAULT_SETTINGS: Settings = {
  radarr: null,
  sonarr: null,
  jellyfin: null,
  plex: null,
  mediaServer: { pollIntervalMinutes: 15, watchedThresholdPct: 90 },
}
const DEFAULT_CACHE: Cache = { radarr: null, sonarr: null }

export function useSettings(): SettingsState & SettingsActions {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [cache, setCache] = useState<Cache>(DEFAULT_CACHE)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<'radarr' | 'sonarr' | 'jellyfin' | 'plex' | null>(null)
  const [refreshing, setRefreshing] = useState<'radarr' | 'sonarr' | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings')
      .then(r => r.json())
      .then(async data => {
        if (cancelled) return
        const settings: Settings = data.settings ?? DEFAULT_SETTINGS
        const cache: Cache = data.cache ?? DEFAULT_CACHE
        setSettings(settings)
        setCache(cache)

        // Auto-refresh cache for any service that has credentials but no cached profiles
        const toRefresh: Array<'radarr' | 'sonarr'> = []
        if (settings.radarr && !cache.radarr?.profiles?.length) toRefresh.push('radarr')
        if (settings.sonarr && !cache.sonarr?.profiles?.length) toRefresh.push('sonarr')

        for (const service of toRefresh) {
          try {
            const res = await fetch('/api/cache', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ service }),
            })
            const result = await res.json() as { ok?: boolean }
            if (result.ok && !cancelled) {
              const updated = await fetch('/api/settings').then(r => r.json())
              if (!cancelled) setCache(updated.cache ?? DEFAULT_CACHE)
            }
          } catch {}
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setSettings(prev => ({ ...prev, ...patch }))
  }, [])

  const testConnection = useCallback(async (service: 'radarr' | 'sonarr' | 'jellyfin' | 'plex') => {
    setTesting(service)
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      })
      return await res.json() as { ok: boolean; version?: string; error?: string }
    } finally {
      setTesting(null)
    }
  }, [])

  const refreshCache = useCallback(async (service: 'radarr' | 'sonarr') => {
    setRefreshing(service)
    try {
      const res = await fetch('/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      })
      const data = await res.json() as { ok?: boolean; error?: { message: string } }
      if (data.ok) {
        const updated = await fetch('/api/settings').then(r => r.json())
        setCache(updated.cache ?? DEFAULT_CACHE)
      }
      return data.ok ? { ok: true } : { ok: false, error: data.error?.message }
    } finally {
      setRefreshing(null)
    }
  }, [])

  return { settings, cache, loading, testing, refreshing, saveSettings, testConnection, refreshCache }
}
