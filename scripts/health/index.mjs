#!/usr/bin/env node
// Weekly repo-health report. Read-only against GitHub (via `gh`, already authenticated)
// and a local build/dev server — never touches production, Supabase, Stripe, or Sentry,
// and never reads or prints secrets. See the `health-checklist` issue document for the
// rationale and threshold behind each check.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  setRoot,
  checkCiHealth,
  checkCoverage,
  checkE2e,
  checkLintWarnings,
  checkTypesAndCasts,
  checkDuplication,
  checkDeadCode,
  checkDependencies,
  checkBundleSize,
  checkLargeFilesAndFunctions,
  checkTodoGrowth,
  checkSecretScan,
  checkSentryManual,
  checkLighthouse,
} from './checks.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
setRoot(ROOT)

const SNAPSHOT_PATH = join(HERE, 'snapshot.json')
const REPORTS_DIR = join(HERE, 'reports')

function loadSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return {}
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
  } catch {
    return {}
  }
}

const STATUS_ICON = { pass: '✅', warn: '⚠️', fail: '❌', skip: '⏭️' }

const CHECKS = [
  { id: 'ci', title: '1. CI pass rate & flaky tests', run: () => checkCiHealth() },
  { id: 'coverage', title: '2. Unit test coverage trend', run: (s) => checkCoverage(s), snapshotKey: 'coverageLinesPct' },
  { id: 'e2e', title: '3. E2E smoke suite status', run: () => checkE2e() },
  { id: 'lint', title: '4. Lint warnings', run: () => checkLintWarnings() },
  { id: 'types', title: '5. Type errors / `as` cast count', run: (s) => checkTypesAndCasts(s), snapshotKey: 'asCastCount' },
  { id: 'duplication', title: '6. Duplication % (jscpd)', run: (s) => checkDuplication(s), snapshotKey: 'duplicationPct' },
  { id: 'deadcode', title: '7. Dead code (knip)', run: () => checkDeadCode() },
  { id: 'deps', title: '8. Dependency vulnerabilities & outdated majors', run: () => checkDependencies() },
  { id: 'bundle', title: '9. Bundle size of key routes', run: (s) => checkBundleSize(s), snapshotKey: 'bundleSizesKb' },
  { id: 'largefiles', title: '10. Large files / functions', run: () => checkLargeFilesAndFunctions() },
  { id: 'todo', title: '11. TODO / FIXME growth', run: (s) => checkTodoGrowth(s), snapshotKey: 'todoCount' },
  { id: 'secrets', title: '12. Secret scan', run: () => checkSecretScan() },
  { id: 'sentry', title: '13. Sentry new-issue count', run: () => checkSentryManual() },
  { id: 'lighthouse', title: '14. Lighthouse perf/a11y (landing page)', run: () => checkLighthouse() },
]

async function main() {
  const snapshot = loadSnapshot()
  const nextSnapshot = { ...snapshot, date: new Date().toISOString() }
  const results = []

  for (const check of CHECKS) {
    process.stderr.write(`Running: ${check.title}...\n`)
    let result
    try {
      result = await check.run(snapshot)
    } catch (err) {
      result = { status: 'skip', summary: `check threw: ${String(err).slice(0, 300)}` }
    }
    results.push({ ...check, result })
    if (check.snapshotKey && result.snapshotValue !== undefined) {
      nextSnapshot[check.snapshotKey] = result.snapshotValue
    }
  }

  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 }
  for (const r of results) counts[r.result.status]++

  const dateStr = new Date().toISOString().slice(0, 10)
  const lines = []
  lines.push(`# Repo Health Report — ${dateStr}`)
  lines.push('')
  lines.push('## Summary')
  lines.push(`${counts.pass} passing, ${counts.warn} warning, ${counts.fail} failing, ${counts.skip} skipped`)
  lines.push('')
  lines.push('No production database, Supabase/Stripe/Sentry API calls, or secrets were read.')
  lines.push('')

  for (const r of results) {
    lines.push(`## ${r.title}`)
    lines.push(`${STATUS_ICON[r.result.status]} **${r.result.status.toUpperCase()}** — ${r.result.summary}`)
    if (r.result.detail?.length) {
      lines.push('')
      for (const d of r.result.detail) lines.push(`- ${d}`)
    }
    lines.push('')
  }

  const report = lines.join('\n')
  console.log(report)

  mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(join(REPORTS_DIR, `${dateStr}.md`), report)
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(nextSnapshot, null, 2) + '\n')

  process.stderr.write(`\nReport written to scripts/health/reports/${dateStr}.md\n`)
  process.stderr.write(`Snapshot updated at scripts/health/snapshot.json (commit it to keep next week's trend data)\n`)
}

main()
