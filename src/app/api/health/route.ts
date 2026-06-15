import { NextResponse } from 'next/server'
import { ADAPTER_CONFIG } from '@/lib/server/config/adapter-config'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '0.1.0',
    adapters: {
      hermes: { version: ADAPTER_CONFIG.hermes.version, mode: ADAPTER_CONFIG.hermes.useMock ? 'mock' : 'live' },
      openclaw: { version: ADAPTER_CONFIG.openclaw.version, mode: ADAPTER_CONFIG.openclaw.useMock ? 'mock' : 'live' }
    },
    timestamp: new Date().toISOString()
  })
}
