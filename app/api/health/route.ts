import { NextResponse } from 'next/server'
import pkg from '@/package.json'

export const runtime = 'nodejs'

export function GET() {
  return NextResponse.json({ status: 'ok', version: pkg.version })
}
