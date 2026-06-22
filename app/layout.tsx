import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bulkarr',
  description: 'Bulk-add movies and series to Radarr and Sonarr',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-slate-900 text-slate-100">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  )
}
