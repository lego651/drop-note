import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { Launcher } from 'chrome-launcher'

const DAY_MS = 24 * 60 * 60 * 1000

export function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 128,
    ...opts,
  })
}

export let ROOT = process.cwd()
export function setRoot(root) {
  ROOT = root
}

// Checks 9 and 14 both need a local production build; memoize so we only pay for it once per run.
let cachedBuild
function buildWebApp() {
  if (cachedBuild) return cachedBuild
  cachedBuild = sh('pnpm', ['--filter', '@drop-note/web', 'build'], {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-role-key',
    },
  })
  return cachedBuild
}

function pass(summary, extra = {}) {
  return { status: 'pass', summary, ...extra }
}
function warn(summary, extra = {}) {
  return { status: 'warn', summary, ...extra }
}
function fail(summary, extra = {}) {
  return { status: 'fail', summary, ...extra }
}
function skip(summary, extra = {}) {
  return { status: 'skip', summary, ...extra }
}

function walk(dirs, { exts, exclude = [] } = {}) {
  const out = []
  for (const dir of dirs) {
    const abs = join(ROOT, dir)
    if (!existsSync(abs)) continue
    const stack = [abs]
    while (stack.length) {
      const current = stack.pop()
      const entries = readdirSync(current, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = join(current, entry.name)
        if (entry.isDirectory()) {
          stack.push(full)
        } else if (!exts || exts.some((ext) => entry.name.endsWith(ext))) {
          if (exclude.some((pattern) => full.includes(pattern))) continue
          out.push(full)
        }
      }
    }
  }
  return out
}

// 1. CI pass rate & flaky tests
export function checkCiHealth() {
  const res = sh('gh', [
    'run', 'list', '--workflow', 'ci.yml', '--limit', '50',
    '--json', 'databaseId,conclusion,status,createdAt,headSha',
  ])
  if (res.status !== 0) return skip(`\`gh run list\` failed: ${res.stderr.trim().slice(0, 200)}`)

  let runs
  try {
    runs = JSON.parse(res.stdout)
  } catch {
    return skip('could not parse `gh run list` output')
  }

  const cutoff = Date.now() - 7 * DAY_MS
  const recent = runs.filter((r) => r.status === 'completed' && new Date(r.createdAt).getTime() >= cutoff)
  if (recent.length === 0) return warn('no completed CI runs (PR or push) in the last 7 days — insufficient data')

  const passCount = recent.filter((r) => r.conclusion === 'success').length
  const passRate = passCount / recent.length

  const bySha = {}
  for (const r of recent) (bySha[r.headSha] ??= []).push(r)
  let flakyShas = 0
  for (const sha in bySha) {
    const group = bySha[sha].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    const sawFailBeforeSuccess = group.some(
      (r, i) => r.conclusion === 'success' && group.slice(0, i).some((p) => p.conclusion === 'failure'),
    )
    if (group.length > 1 && sawFailBeforeSuccess) flakyShas++
  }

  const pct = Math.round(passRate * 100)
  const summary = `${pct}% pass rate over ${recent.length} CI runs in the last 7 days (PR + push); ${flakyShas} commit(s) needed a re-run to go green`
  if (passRate < 0.9 || flakyShas > 1) return fail(summary)
  if (flakyShas === 1) return warn(summary)
  return pass(summary)
}

// 2. Unit test coverage trend
export function checkCoverage(snapshot) {
  const res = sh('pnpm', ['test:coverage'])
  const summaryPath = join(ROOT, 'coverage/coverage-summary.json')
  if (!existsSync(summaryPath)) {
    return skip(`coverage-summary.json not produced (exit ${res.status}): ${res.stderr.trim().slice(0, 300)}`)
  }
  const data = JSON.parse(readFileSync(summaryPath, 'utf8'))
  const pct = data.total.lines.pct
  const prev = snapshot.coverageLinesPct
  const delta = typeof prev === 'number' ? pct - prev : null
  const trend = delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pt vs last run)`
  const summary = `${pct.toFixed(1)}% line coverage${trend}`
  let result
  if (pct < 50 || (delta !== null && delta < -3)) result = fail(summary)
  else result = pass(summary)
  result.snapshotValue = pct
  return result
}

// 3. E2E smoke suite status
export function checkE2e() {
  const list = sh('gh', ['run', 'list', '--workflow', 'ci.yml', '--limit', '15', '--json', 'databaseId,createdAt'])
  if (list.status !== 0) return skip(`\`gh run list\` failed: ${list.stderr.trim().slice(0, 200)}`)

  let runs
  try {
    runs = JSON.parse(list.stdout)
  } catch {
    return skip('could not parse `gh run list` output')
  }
  runs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const e2eRuns = []
  for (const r of runs) {
    if (e2eRuns.length >= 3) break
    const view = sh('gh', ['run', 'view', String(r.databaseId), '--json', 'jobs'])
    if (view.status !== 0) continue
    let data
    try {
      data = JSON.parse(view.stdout)
    } catch {
      continue
    }
    const job = data.jobs?.find((j) => j.name === 'E2E tests')
    if (job) e2eRuns.push(job.conclusion || job.status || 'in_progress')
  }

  if (e2eRuns.length === 0) {
    return warn('no recent CI run included an "E2E tests" job (it only runs on pull_request events)')
  }
  const failing = e2eRuns.filter((c) => c !== 'success').length
  const summary = `last ${e2eRuns.length} CI run(s) with an E2E job: ${e2eRuns.join(', ')}`
  if (failing > 0) return fail(summary)
  return pass(summary)
}

// 4. Lint warnings
export function checkLintWarnings() {
  const targets = [
    { dir: 'apps/web', config: 'apps/web/.eslintrc.json', paths: ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/web/hooks'] },
    { dir: 'packages/shared', config: '.eslintrc.js', paths: ['packages/shared/src'] },
  ]
  let warnings = 0
  let errors = 0
  const errorsOut = []
  let targetsAttempted = 0
  let targetsParsed = 0
  for (const t of targets) {
    const existingPaths = t.paths.filter((p) => existsSync(join(ROOT, p)))
    if (existingPaths.length === 0) continue
    targetsAttempted++
    const res = sh('npx', ['eslint', '-c', t.config, '--format', 'json', '--ext', '.ts,.tsx', ...existingPaths])
    if (!res.stdout) continue
    let files
    try {
      files = JSON.parse(res.stdout)
    } catch {
      continue
    }
    targetsParsed++
    for (const f of files) {
      for (const m of f.messages) {
        if (m.severity === 1) warnings++
        else if (m.severity === 2) {
          errors++
          errorsOut.push(`${f.filePath}:${m.line} ${m.ruleId}`)
        }
      }
    }
  }
  if (targetsAttempted > 0 && targetsParsed === 0) {
    return skip('eslint produced no parseable output for any target — could not determine lint status')
  }
  const summary = `${warnings} warning(s), ${errors} error(s) (errors should be 0 — CI blocks on them)`
  if (errors > 0) return fail(summary, { detail: errorsOut.slice(0, 10) })
  if (warnings > 20) return fail(summary)
  return pass(summary)
}

// 5. Type errors / `as` cast count
export function checkTypesAndCasts(snapshot) {
  const res = sh('pnpm', ['turbo', 'typecheck'])
  const typecheckOk = res.status === 0

  const files = walk(['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/web/hooks', 'packages/shared/src'], {
    exts: ['.ts', '.tsx'],
    exclude: ['.test.', 'database.types.ts'],
  })
  let castCount = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    for (const line of lines) {
      if (/^\s*(import|export)\b/.test(line)) continue
      const matches = line.match(/\bas\b/g)
      if (!matches) continue
      for (const m of matches) {
        if (/\bas\s+(const|unknown)\b/.test(line)) continue
        castCount++
      }
    }
  }

  const prevCasts = snapshot.asCastCount
  const delta = typeof prevCasts === 'number' ? castCount - prevCasts : null
  const trend = delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${delta} vs last run)`
  const summary = `typecheck ${typecheckOk ? 'clean' : 'FAILING'}; ~${castCount} \`as\` casts${trend}`
  let result
  if (!typecheckOk || (delta !== null && delta > 5)) result = fail(summary)
  else result = pass(summary)
  result.snapshotValue = castCount
  return result
}

// 6. Duplication % (jscpd)
export function checkDuplication(snapshot) {
  const outDir = join(ROOT, 'scripts/health/.jscpd-tmp')
  const res = sh('npx', [
    'jscpd', 'apps/web/app', 'apps/web/components', 'apps/web/lib', 'packages/shared/src',
    '--reporters', 'json', '--output', outDir, '--silent',
    '--ignore', '**/*.test.*,**/database.types.ts',
  ])
  const reportPath = join(outDir, 'jscpd-report.json')
  if (!existsSync(reportPath)) {
    return skip(`jscpd did not produce a report (exit ${res.status}): ${res.stderr.trim().slice(0, 300)}`)
  }
  const data = JSON.parse(readFileSync(reportPath, 'utf8'))
  const pct = data.statistics.total.percentage
  const biggestClone = Math.max(0, ...(data.duplicates ?? []).map((d) => d.lines ?? 0))
  const prev = snapshot.duplicationPct
  const delta = typeof prev === 'number' ? pct - prev : null
  const trend = delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pt vs last run)`
  const summary = `${pct.toFixed(1)}% duplicated lines${trend}, largest clone ~${biggestClone} lines`
  let result
  if (pct > 5 || biggestClone > 50) result = fail(summary)
  else result = pass(summary)
  result.snapshotValue = pct
  return result
}

// 7. Dead code (knip)
export function checkDeadCode() {
  const res = sh('npx', ['knip', '--reporter', 'json'])
  if (!res.stdout) {
    return skip(`knip produced no output (exit ${res.status}): ${res.stderr.trim().slice(0, 300)}`)
  }
  let data
  try {
    data = JSON.parse(res.stdout)
  } catch {
    return skip('could not parse knip output')
  }
  const issues = data.issues ?? []
  const unusedFiles = issues.filter((i) => i.files?.length > 0).length
  const unusedExports = issues.reduce((n, i) => n + (i.exports?.length ?? 0) + (i.types?.length ?? 0) + (i.enumMembers?.length ?? 0), 0)
  const summary = `${unusedFiles} unused file(s), ${unusedExports} unused export(s)`
  if (unusedFiles > 0 || unusedExports > 10) return fail(summary)
  return pass(summary)
}

// 8. Dependency vulnerabilities & outdated majors
export function checkDependencies() {
  // pnpm audit/outdated exit non-zero when they find anything to report; stdout is still valid JSON.
  const auditRes = sh('pnpm', ['audit', '--json'])
  let vulnSummary = 'audit unavailable'
  let highCritical = 0
  let auditOk = false
  try {
    const audit = JSON.parse(auditRes.stdout)
    const v = audit.metadata?.vulnerabilities ?? {}
    highCritical = (v.high ?? 0) + (v.critical ?? 0)
    vulnSummary = `${v.critical ?? 0} critical, ${v.high ?? 0} high, ${v.moderate ?? 0} moderate, ${v.low ?? 0} low`
    auditOk = true
  } catch {
    /* leave defaults if stdout wasn't parseable JSON */
  }

  const outdatedRes = sh('pnpm', ['outdated', '--format', 'json'])
  let majorsBehind = 0
  try {
    const outdated = JSON.parse(outdatedRes.stdout || '{}')
    for (const name of Object.keys(outdated)) {
      const { current, latest } = outdated[name]
      const curMajor = parseInt(String(current).replace(/^\D+/, '').split('.')[0], 10)
      const latestMajor = parseInt(String(latest).replace(/^\D+/, '').split('.')[0], 10)
      if (Number.isFinite(curMajor) && Number.isFinite(latestMajor) && latestMajor - curMajor > 2) {
        majorsBehind++
      }
    }
  } catch {
    /* pnpm outdated exits 1 when there are outdated packages; JSON is still on stdout */
  }

  const summary = `vulnerabilities: ${vulnSummary}; ${majorsBehind} direct dependency(ies) > 2 majors behind`
  if (!auditOk) {
    return skip(`${summary} — \`pnpm audit\` produced no parseable JSON, so vulnerability status is unconfirmed`)
  }
  if (highCritical > 0 || majorsBehind > 0) return fail(summary)
  return pass(summary)
}

// 9. Bundle size of key routes
export function checkBundleSize(snapshot) {
  const build = buildWebApp()
  const output = (build.stdout || '') + '\n' + (build.stderr || '')
  if (build.status !== 0) {
    return skip(`local production build failed (exit ${build.status}) — cannot measure bundle size. Uses placeholder, non-secret env vars only.`)
  }

  const targets = ['/', '/dashboard', '/settings', '/login']
  const sizes = {}
  for (const line of output.split('\n')) {
    const tokens = line.trim().split(/\s+/)
    if (tokens.length !== 7) continue
    if (!['ƒ', '○', '●', 'λ'].includes(tokens[1])) continue
    const route = tokens[2]
    if (!targets.includes(route)) continue
    sizes[route] = toKb(tokens[5], tokens[6])
  }

  const prevSizes = snapshot.bundleSizesKb ?? {}
  const lines = []
  let worst = 'pass'
  for (const route of targets) {
    const kb = sizes[route]
    if (kb === undefined) {
      lines.push(`${route}: not found in build output`)
      continue
    }
    const prev = prevSizes[route]
    const growthPct = typeof prev === 'number' && prev > 0 ? ((kb - prev) / prev) * 100 : null
    const trend = growthPct === null ? '' : ` (${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(0)}% vs last run)`
    lines.push(`${route}: ${kb.toFixed(0)}kB${trend}`)
    if (kb > 250 || (growthPct !== null && growthPct > 15)) worst = 'fail'
  }

  const result = worst === 'fail' ? fail(lines.join('; ')) : pass(lines.join('; '))
  result.snapshotValue = sizes
  return result
}

function toKb(value, unit) {
  const n = parseFloat(value)
  const u = unit.toLowerCase()
  if (u === 'mb') return n * 1024
  if (u === 'kb') return n
  return n / 1024
}

// 10. Large files / functions
export function checkLargeFilesAndFunctions() {
  const dirs = ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/web/hooks', 'packages/shared/src']
  const files = walk(dirs, { exts: ['.ts', '.tsx'], exclude: ['database.types.ts'] })
  const largeFiles = files
    .map((f) => ({ f, lines: readFileSync(f, 'utf8').split('\n').length }))
    .filter((x) => x.lines > 400)

  const existing = dirs.filter((d) => existsSync(join(ROOT, d)))
  const eslintRes = sh('npx', [
    'eslint', '--rule',
    JSON.stringify({ 'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }] }),
    '--no-inline-config', '--format', 'json', '--ext', '.ts,.tsx', ...existing,
  ])
  let largeFunctions = 0
  let eslintOk = false
  try {
    const parsed = JSON.parse(eslintRes.stdout)
    largeFunctions = parsed.reduce((n, f) => n + f.messages.filter((m) => m.ruleId === 'max-lines-per-function').length, 0)
    eslintOk = true
  } catch {
    /* leave 0 if eslint output unparsable */
  }

  const detail = largeFiles.slice(0, 5).map((x) => `${x.f.replace(ROOT + '/', '')} (${x.lines} lines)`)
  if (!eslintOk) {
    const summary = `${largeFiles.length} file(s) > 400 lines; large-function count unavailable (eslint produced no parseable output)`
    return largeFiles.length > 0 ? warn(summary, { detail }) : skip(summary)
  }

  const summary = `${largeFiles.length} file(s) > 400 lines, ${largeFunctions} function(s) > 80 lines`
  if (largeFiles.length > 0 || largeFunctions > 0) {
    return warn(summary, { detail })
  }
  return pass(summary)
}

// 11. TODO / FIXME growth
export function checkTodoGrowth(snapshot) {
  const dirs = ['apps/web', 'packages/shared/src']
  const files = walk(dirs, { exts: ['.ts', '.tsx'], exclude: ['database.types.ts'] })
  let count = 0
  let oldest = null
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    lines.forEach((line, idx) => {
      if (/TODO|FIXME/.test(line)) {
        count++
        const blame = sh('git', ['log', '-1', '--format=%at', '-L', `${idx + 1},${idx + 1}:${file}`])
        const ts = parseInt((blame.stdout || '').trim().split('\n')[0], 10)
        if (Number.isFinite(ts)) {
          const ageDays = (Date.now() / 1000 - ts) / 86400
          if (oldest === null || ageDays > oldest) oldest = ageDays
        }
      }
    })
  }
  const prev = snapshot.todoCount
  const delta = typeof prev === 'number' ? count - prev : null
  const trend = delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${delta} vs last run)`
  const oldestStr = oldest === null ? '' : `, oldest ~${Math.round(oldest)} days old`
  const summary = `${count} TODO/FIXME${trend}${oldestStr}`
  let result
  if ((delta !== null && delta > 5) || (oldest !== null && oldest > 60)) result = warn(summary)
  else result = pass(summary)
  result.snapshotValue = count
  return result
}

// 12. Secret scan (built-in — avoids adding an unverified "gitleaks" npm wrapper, see report note)
const SECRET_PATTERNS = [
  { name: 'AWS Access Key ID', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Private key block', re: /-----BEGIN (RSA|EC|OPENSSH|PGP|DSA) PRIVATE KEY-----/ },
  { name: 'Stripe live secret key', re: /sk_live_[0-9a-zA-Z]{20,}/ },
  { name: 'Stripe restricted key (live)', re: /\brk_live_[0-9a-zA-Z]{20,}/ },
  { name: 'Stripe webhook secret', re: /\bwhsec_[0-9a-zA-Z]{20,}/ },
  { name: 'Resend API key', re: /\bre_[0-9a-zA-Z]{20,}/ },
  { name: 'OpenAI API key', re: /sk-[A-Za-z0-9]{32,}/ },
  { name: 'SendGrid API key', re: /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Supabase/JWT-style key', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'Generic secret assignment (quoted)', re: /(secret|password|api[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-/+]{24,}["']/i },
  {
    // Excludes the "your-..." placeholder convention used throughout .env.example and docs copied from it.
    name: 'Unquoted secret env assignment',
    re: /\b(SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|RESEND_API_KEY|SENDGRID_INGEST_SECRET|SENTRY_AUTH_TOKEN|CRON_SECRET|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|UPSTASH_REDIS_REST_TOKEN)\s*=\s*(?!your[-_])[^\s"']{16,}/,
  },
]
export function checkSecretScan() {
  const lsFiles = sh('git', ['ls-files'])
  if (lsFiles.status !== 0) return skip('`git ls-files` failed')
  const files = lsFiles.stdout
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.startsWith('scripts/health/')) // avoid matching this file's own pattern definitions
    .filter((f) => !/\.(lock|lockb|png|jpg|jpeg|gif|ico|woff2?|ttf|pdf)$/.test(f))
    .filter((f) => f !== 'pnpm-lock.yaml')
    .filter((f) => !/\.env\.example$/.test(f)) // placeholder values ("eyJ...", "re_...") by convention, not real secrets

  const hits = []
  for (const file of files) {
    const abs = join(ROOT, file)
    let stat
    try {
      stat = statSync(abs)
    } catch {
      continue
    }
    if (!stat.isFile() || stat.size > 512_000) continue
    let text
    try {
      text = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n')
    lines.forEach((line, idx) => {
      if (/process\.env/.test(line)) return
      for (const { name, re } of SECRET_PATTERNS) {
        if (re.test(line)) hits.push(`${file}:${idx + 1} (${name})`)
      }
    })
  }
  const summary = hits.length === 0 ? 'no pattern matches in tracked files' : `${hits.length} possible match(es)`
  if (hits.length > 0) return fail(summary, { detail: hits.slice(0, 10) })
  return pass(summary)
}

// 13. Sentry new-issue count — deferred, manual
export function checkSentryManual() {
  return skip('deferred — needs a new Sentry API credential; board approval required separately. Check the Sentry dashboard manually this week.')
}

async function findChrome() {
  try {
    const installations = await Launcher.getInstallations()
    if (installations.length) return installations[0]
  } catch {
    /* fall through to cache-dir probe */
  }
  const cacheDirs = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')]
  const subPaths = [
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-mac-x64/Chromium.app/Contents/MacOS/Chromium',
    'chrome-linux/chrome',
    'chrome-linux64/chrome',
  ]
  for (const dir of cacheDirs) {
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir)) {
      if (!entry.startsWith('chromium-')) continue
      for (const sub of subPaths) {
        const p = join(dir, entry, sub)
        if (existsSync(p)) return p
      }
    }
  }
  return undefined
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status < 500) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// 14. Lighthouse perf/a11y (landing page)
export async function checkLighthouse() {
  const chromePath = await findChrome()
  if (!chromePath) {
    return skip('no local Chrome/Chromium binary found — run `pnpm exec playwright install chromium` to enable this check')
  }

  const build = buildWebApp()
  if (build.status !== 0) return skip('local production build failed — cannot run Lighthouse')

  const port = 4173
  const proc = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: join(ROOT, 'apps/web'),
    // Same placeholder env as buildWebApp() — process.env values set here win over
    // any apps/web/.env.local on disk, so this never calls production Supabase.
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-role-key',
    },
    stdio: 'ignore',
  })

  try {
    const up = await waitForServer(`http://localhost:${port}/`, 30_000)
    if (!up) return skip('local production server did not come up within 30s — cannot run Lighthouse')

    const res = sh('npx', [
      'lighthouse', `http://localhost:${port}/`,
      '--output=json', '--quiet',
      '--chrome-flags=--headless=new --no-sandbox',
      `--chrome-path=${chromePath}`,
      '--only-categories=performance,accessibility',
    ])
    if (res.status !== 0 || !res.stdout) {
      return skip(`lighthouse failed to run (exit ${res.status}): ${(res.stderr || '').trim().slice(0, 300)}`)
    }
    const report = JSON.parse(res.stdout)
    const perf = Math.round((report.categories.performance.score ?? 0) * 100)
    const a11y = Math.round((report.categories.accessibility.score ?? 0) * 100)
    const summary = `performance ${perf}, accessibility ${a11y}`
    if (perf < 80 || a11y < 90) return fail(summary)
    return pass(summary)
  } catch (err) {
    return skip(`lighthouse check errored: ${String(err).slice(0, 300)}`)
  } finally {
    proc.kill()
  }
}
