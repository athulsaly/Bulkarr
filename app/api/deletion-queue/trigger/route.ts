export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { runExecutorCycle } from '@/lib/deletion-executor'

export async function POST(_req: NextRequest) {
  try {
    const result = await runExecutorCycle()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ executed: 0, failed: 0, errorMessage: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
