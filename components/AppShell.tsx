'use client'
import { useState } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { Spinner } from './Spinner'
import { SetupScreen } from './SetupScreen'
import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const settingsHook = useSettings()
  const [setupDone, setSetupDone] = useState(false)

  if (settingsHook.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f12]">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="w-8 h-8 text-indigo-500" />
          <span className="text-slate-500 text-sm">Loading…</span>
        </div>
      </div>
    )
  }

  const needsSetup = !setupDone &&
    !settingsHook.settings.radarr &&
    !settingsHook.settings.sonarr

  if (needsSetup) {
    return <SetupScreen hook={settingsHook} onComplete={() => setSetupDone(true)} />
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-[#0f0f12]">
        {children}
      </main>
    </div>
  )
}
