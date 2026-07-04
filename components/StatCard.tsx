import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  label: string
  value: number | string
  accent?: boolean
}

export function StatCard({ icon, label, value, accent }: Props) {
  return (
    <div className="rounded-xl border border-[#2a2a3a] bg-[#1c1c28] p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {accent && <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1" />}
      </div>
      <div className="text-3xl font-bold text-slate-100">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  )
}
