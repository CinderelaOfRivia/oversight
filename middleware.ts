import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Allow all API routes to bypass any protection
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Add headers to bypass Vercel protection for webhook endpoints
    const response = NextResponse.next()
    response.headers.set('X-Vercel-Protection-Bypass', 'true')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}