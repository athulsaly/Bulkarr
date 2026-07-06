import { NextResponse } from 'next/server'
import { getWebhookLog } from '@/lib/webhook-log'

export const runtime = 'nodejs'

export function GET() {
  return NextResponse.json({ entries: getWebhookLog() })
}
