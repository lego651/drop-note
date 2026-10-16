import '@testing-library/jest-dom/vitest'

// Don't persist request logs to Supabase from unit tests (see lib/observability/logger.ts).
process.env.REQUEST_LOGS_ENABLED = 'false'
