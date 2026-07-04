'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { WatchedDrawer } from './WatchedDrawer'
import { HistoryDrawer } from './HistoryDrawer'

const NAV_GROUPS = [
  {
    items: [{ href: '/', label: 'Dashboard' }],
  },
  {
    label: 'ADD MEDIA',
    items: [
      { href: '/add/movies', label: 'Movies' },
      { href: '/add/series', label: 'Series' },
    ],
  },
  {
    label: 'TOOLS',
    items: [
      { href: '/manage', label: 'Manage' },
      { href: '/library', label: 'Library' },
      { href: '/rules', label: 'Rules' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [watchedOpen, setWatchedOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [unmatchedCount, setUnmatchedCount] = useState(0)

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const linkClass = (href: string) =>
    isActive(href)
      ? 'flex items-center px-3 py-2 text-sm rounded-lg bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500 pl-[10px] transition-colors'
      : 'flex items-center px-3 py-2 text-sm rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors'

  return (
    <>
      <aside className="w-[220px] shrink-0 bg-[#161620] border-r border-[#2a2a3a] flex flex-col h-screen overflow-y-auto">
        {/* Logo */}
        <div className="px-5 py-5 shrink-0">
          <span className="font-bold text-indigo-400 tracking-tight text-lg select-none">◈ Bulkarr</span>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 px-3 space-y-1 pb-2">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'pt-4' : ''}>
              {group.label && (
                <p className="px-3 pb-1.5 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">
                  {group.label}
                </p>
              )}
              {group.items.map(item => (
                <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 shrink-0 border-t border-[#2a2a3a] pt-3 space-y-1">
          <button
            onClick={() => setWatchedOpen(true)}
            className="flex items-center justify-between w-full px-3 py-2 text-sm text-slate-400 hover:text-slate-100 hover:bg-white/5 rounded-lg transition-colors"
          >
            <span>Watched</span>
            {unmatchedCount > 0 && (
              <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {unmatchedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setHistoryOpen(true)}
            className="w-full flex items-center px-3 py-2 text-sm text-slate-400 hover:text-slate-100 hover:bg-white/5 rounded-lg transition-colors"
          >
            History
          </button>
          <Link href="/settings" className={linkClass('/settings')}>
            Settings
          </Link>
        </div>
      </aside>

      <WatchedDrawer
        open={watchedOpen}
        onClose={() => setWatchedOpen(false)}
        onUnmatchedCountChange={setUnmatchedCount}
      />
      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  )
}
