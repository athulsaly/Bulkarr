export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import type { DeletionQueueStatus } from '@/lib/types'

const VALID_STATUSES: DeletionQueueStatus[] = ['pending', 'done', 'failed', 'cancelled']

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') as DeletionQueueStatus | null
  const store = readStore()
  const items = status && VALID_STATUSES.includes(status)
    ? store.deletionQueue.filter(i => i.status === status)
    : store.deletionQueue
  return NextResponse.json({ items })
}
