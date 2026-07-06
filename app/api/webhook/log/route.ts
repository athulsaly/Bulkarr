import { NextResponse } from 'next/server'
import { getWebhookLog } from '@/lib/webhook-log'

export const runtime = 'nodejs'

export function GET() {
  if (!process.env.WEBHOOK_DEBUG) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ entries: getWebhookLog() })
}
