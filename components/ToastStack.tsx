'use client'
import type { Toast } from '@/hooks/useToast'

interface Props {
  toasts: Toast[]
  dismiss: (id: string) => void
}

const kindClass: Record<Toast['kind'], string> = {
  success: 'bg-green-700 border-green-500',
  error: 'bg-red-800 border-red-500',
  info: 'bg-[#1c1c28] border-[#2a2a3a]',
}

export function ToastStack({ toasts, dismiss }: Props) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-2 rounded border px-3 py-2 text-sm text-slate-100 shadow-lg ${kindClass[t.kind]}`}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-white leading-none">×</button>
        </div>
      ))}
    </div>
  )
}
