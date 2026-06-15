import { NextResponse } from 'next/server'

export const ApiResponse = {
  ok: <T>(data: T) => NextResponse.json({ success: true, data }),
  error: (message: string, status = 500) => 
    NextResponse.json({ success: false, error: message }, { status }),
  apiError: (message: string, status = 500, code = 'INTERNAL_ERROR') => 
    NextResponse.json({ success: false, error: { code, message } }, { status }),
}
