export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { runExecutorCycle } from '@/lib/deletion-executor'

export async function POST(_req: NextRequest) {
  const result = await runExecutorCycle()
  return NextResponse.json(result)
}
