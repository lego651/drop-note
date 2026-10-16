import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
})

// Lets Sentry attach client-side navigations to traces (Next 15 router hook).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
