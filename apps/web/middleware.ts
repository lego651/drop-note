import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { CORRELATION_HEADER, resolveCorrelationId } from '@/lib/observability/correlation'

export async function middleware(request: NextRequest) {
  // Every request gets a correlation id: forwarded to route handlers (request header)
  // and returned to the caller (response header) so a failing request can be traced
  // in request_logs / Sentry.
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER))
  request.headers.set(CORRELATION_HEADER, correlationId)

  // /pricing is fully public — skip session refresh to avoid unnecessary Supabase call
  const response = request.nextUrl.pathname === '/pricing'
    ? NextResponse.next({ request })
    : await updateSession(request)

  response.headers.set(CORRELATION_HEADER, correlationId)
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
