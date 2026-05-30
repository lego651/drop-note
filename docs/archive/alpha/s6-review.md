# Sprint 6 — Post-Merge Code Review

> Reviewer role: Tech Lead / Code Auditor
> Date: 2026-03-27
> Scope: All code shipped in S6 commits (`5a03d03`, `49771be`, `39e53d4`)
> Verdict: Sprint 6 delivered a lot of surface area. The E2E suite, CI pipeline, Docker setup, AI abstraction, security pass, and legal pages all exist. But several implementations cut corners that will bite in production or block contributors. 22 tickets below, ordered by severity.

---

## Summary of Findings

| Severity | Count | Area |
|---|---|---|
| P0 — Must fix before launch | 4 | AI provider, Dockerfile, security |
| P1 — Should fix before launch | 8 | CI, E2E, performance, consistency |
| P2 — Fix soon after launch | 6 | Tests, docs, DX |
| P3 — Improve when convenient | 4 | Style, minor DX |

---

## P0 — Must Fix Before Launch

---

### R001 — AI provider makes raw fetch with zero error handling

**Files:** `packages/shared/src/ai-provider.ts` (all three provider classes)

**Problem:** Every `processText` and `describeImage` method does `await fetch(...)` followed by `response.json()` and `JSON.parse(data.choices[0].message.content)` but never checks `response.ok` or the HTTP status code. If the AI API returns 401 (bad key), 429 (rate limited), 500 (server error), or a non-JSON response, the code will throw an opaque `TypeError` like `Cannot read properties of undefined (reading 'message')` instead of a useful error.

This is production-critical because the worker retries jobs 3 times on failure — without a clear error message, debugging will be a nightmare.

**Why it matters:** Every single email ingestion passes through this code. A transient AI API error will produce confusing stack traces in Sentry and waste retry attempts on non-retryable errors (like 401).

**Fix:**
1. Check `response.ok` after every `fetch` call. If false, read `response.text()` and throw a typed error with the status code and body excerpt.
2. Distinguish retryable errors (429, 500, 502, 503) from non-retryable ones (400, 401, 403) so the caller can decide whether to retry.
3. Add a request timeout via `AbortSignal.timeout(30_000)` — a hanging API call currently blocks the worker job indefinitely with no timeout.

**Acceptance:**
- [ ] All three providers check `response.ok` before parsing JSON
- [ ] A 429 response throws an error containing "rate limit" and the status code
- [ ] A 401 response throws an error containing "unauthorized" or "invalid key"
- [ ] All fetch calls have an `AbortSignal.timeout()` (30s default, configurable)
- [ ] Existing unit tests updated; new tests for error responses added

---

### R002 — Dockerfile missing HOSTNAME binding — container won't be reachable

**File:** `apps/web/Dockerfile`

**Problem:** The Next.js standalone server binds to `127.0.0.1` (localhost) by default. Inside a Docker container, this means the server is only reachable from within the container itself — `docker compose up` will start, the health check (if any) will pass inside the container, but `http://localhost:3000` from the host machine will get `connection refused`.

**Why it matters:** Any contributor who follows the Docker Compose quickstart in CONTRIBUTING.md will hit this immediately and think the setup is broken.

**Fix:** Add `ENV HOSTNAME="0.0.0.0"` to the runner stage of the Dockerfile, before `EXPOSE 3000`.

Also fix:
- The deps stage does `COPY --from=deps /app/node_modules ./node_modules` but doesn't copy workspace-level `node_modules` from `apps/web/node_modules` or `packages/shared/node_modules`. With pnpm's workspace hoisting, these may contain packages not available at the root. Verify the build works with a clean `docker build` or switch to `pnpm deploy` for a flat output.
- Add `ENV PORT=3000` explicitly for clarity.

**Acceptance:**
- [ ] `docker compose up` from a fresh clone → `http://localhost:3000` returns the login page
- [ ] `ENV HOSTNAME="0.0.0.0"` present in Dockerfile
- [ ] A clean `docker build` from the root context succeeds without missing module errors

---

### R003 — Gemini API key exposed in URL query parameter

**File:** `packages/shared/src/ai-provider.ts` lines 138–139, 163–164

**Problem:** The `GeminiProvider` passes the API key as `?key=${this.apiKey}` in the URL. This exposes the key in:
- Server access logs
- Proxy/CDN logs
- Any HTTP-level monitoring or tracing tool
- Error reporting (Sentry will capture the full URL in breadcrumbs)

Google's Generative AI API supports header-based auth via `x-goog-api-key`.

**Fix:** Move the API key from the query string to the request headers:
```typescript
headers: {
  'Content-Type': 'application/json',
  'x-goog-api-key': this.apiKey,
},
```
Remove `?key=${this.apiKey}` from the URL.

**Acceptance:**
- [ ] Gemini API key is passed via `x-goog-api-key` header, not URL
- [ ] No API key appears in any URL string in the codebase

---

### R004 — AI provider factory silently passes `undefined` when API key is missing

**File:** `packages/shared/src/ai-provider.ts` lines 185–199

**Problem:** `createAIProvider()` does `process.env.OPENAI_API_KEY!` (non-null assertion). If someone sets `AI_PROVIDER=openai` but forgets `OPENAI_API_KEY`, the factory returns an `OpenAIProvider` constructed with `undefined` as the key. The error only surfaces later at runtime when a fetch call fails with a confusing 401.

**Fix:** Validate the API key exists before constructing the provider. Throw a clear startup error:
```typescript
case 'openai': {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('AI_PROVIDER is "openai" but OPENAI_API_KEY is not set')
  return new OpenAIProvider(key)
}
```
Apply to all three providers.

**Acceptance:**
- [ ] Missing API key for the selected provider throws at factory call time with a message naming the missing env var
- [ ] No non-null assertions (`!`) on env var reads in the factory
- [ ] Unit test covers missing key scenario for each provider

---

## P1 — Should Fix Before Launch

---

### R005 — docker-compose.yml uses deprecated `version` key and has no healthchecks

**File:** `docker-compose.yml`

**Problem:**
1. `version: '3.9'` is deprecated in Docker Compose V2 (the current standard). It triggers a warning and is ignored. Remove it.
2. No services define healthchecks. `depends_on: [redis]` only waits for the container to start, not for Redis to be ready. The web and worker services may start before Redis is accepting connections, causing startup crashes.
3. Redis is exposed on port 6379 with no password — fine for local dev, but should be documented.

**Fix:**
- Remove the `version` key
- Add a healthcheck for Redis: `test: ["CMD", "redis-cli", "ping"]`
- Add `depends_on` conditions: `condition: service_healthy`
- Add a comment noting Redis is intentionally open for local dev

**Acceptance:**
- [ ] No `version` key in docker-compose.yml
- [ ] Redis has a healthcheck; web and worker wait for `service_healthy`
- [ ] `docker compose up` shows no deprecation warnings

---

### R006 — DELETE /api/items has N+1 query pattern — up to 200 DB calls for 100 items

**File:** `apps/web/app/api/items/route.ts` lines 44–48

**Problem:** The delete handler loops `for (const id of ids)` and calls `deleteItem(id, ...)` sequentially. Each call makes 1–2 DB queries (check deleted_at + delete/update). For a bulk delete of 100 items, that's 100–200 sequential Supabase calls. At ~50ms per call, that's 5–10 seconds of request time.

**Why it matters:** The UI has a "select all" + delete flow. A user with 100 items hitting delete will get a timeout or extremely slow response.

**Fix:**
1. For free-tier users: batch the hard delete into a single `.delete().in('id', ids).eq('user_id', userId)` query.
2. For paid-tier users: batch the soft-delete into a single `.update({ deleted_at: ... }).in('id', ids).eq('user_id', userId).is('deleted_at', null)` for items not yet trashed, and a separate batch delete for already-trashed items.
3. The `deleteItem` single-item function should remain for the single-delete case, but the route handler needs a batch path.

**Acceptance:**
- [ ] Bulk delete of 100 items completes in < 2 DB round-trips (not 200)
- [ ] Free tier bulk delete is one DELETE query
- [ ] Paid tier bulk delete is at most 2 queries (one for soft-delete, one for permanent)
- [ ] Existing `deleteItem` unit tests still pass
- [ ] New test covers batch delete behavior

---

### R007 — Anthropic provider doesn't enforce JSON output format

**File:** `packages/shared/src/ai-provider.ts` lines 76–98

**Problem:** OpenAI uses `response_format: { type: 'json_object' }` and Gemini uses `responseMimeType: 'application/json'` to guarantee structured JSON output. The Anthropic provider relies entirely on prompt instruction ("Return JSON with..."). Claude can and does sometimes return JSON wrapped in markdown code fences (` ```json ... ``` `), which will cause `JSON.parse()` to throw.

**Fix:** Either:
- (a) Strip markdown code fences before parsing: `text.replace(/^```(?:json)?\n?|\n?```$/g, '').trim()`
- (b) Use Anthropic's tool use / structured output feature to force JSON
- (c) At minimum, add a try/catch around the parse with a cleanup attempt

**Acceptance:**
- [ ] Anthropic responses wrapped in code fences are handled gracefully
- [ ] Test covers the code-fence-wrapped JSON scenario

---

### R008 — AI provider test coverage is inadequate

**File:** `packages/shared/src/__tests__/ai-provider.test.ts`

**Problem:** The test file has meaningful gaps:
1. No test for `GeminiProvider` at all
2. No test for `describeImage` on any provider
3. No test for non-200 API responses
4. No test for malformed JSON from AI API
5. `global.fetch` is assigned in the test but never cleaned up in `afterEach` — this can leak to other tests

**Why it matters:** The AI provider is the most critical integration. Untested error paths will produce silent failures in production.

**Fix:**
1. Add `GeminiProvider.processText` test (same pattern as OpenAI test)
2. Add `describeImage` tests for at least one provider
3. Add error response tests: mock `fetch` to return `{ ok: false, status: 429 }` and assert the error is surfaced
4. Add malformed JSON test: mock API returning `"Sure, here's a summary: ..."` instead of JSON
5. Add `afterEach(() => { vi.restoreAllMocks() })` to clean up global.fetch

**Acceptance:**
- [ ] All three providers have at least one `processText` test
- [ ] At least one `describeImage` test exists
- [ ] Error response (non-200) test exists
- [ ] Malformed JSON response test exists
- [ ] `vi.restoreAllMocks()` in afterEach

---

### R009 — README and CONTRIBUTING.md contain placeholder GitHub URLs

**Files:** `README.md` lines 6, 32; `CONTRIBUTING.md` lines 24, 53

**Problem:** Both files use `YOUR_ORG/drop-note` or `your-org/drop-note` as the GitHub repository URL. Anyone who clones from the README will get a 404. The CI badge in the README is also broken because it points to a non-existent repo.

**Fix:** Replace all instances with the actual GitHub org/repo name. If the repo isn't public yet, use a consistent placeholder that's obviously temporary (like `TODO-ORG`) and add it to the launch checklist.

**Acceptance:**
- [ ] No instances of `YOUR_ORG` or `your-org` in any committed file
- [ ] CI badge URL resolves (or is clearly marked as TODO)
- [ ] `git clone` URL in README works

---

### R010 — CI has no job timeout limits

**File:** `.github/workflows/ci.yml`

**Problem:** None of the four CI jobs set `timeout-minutes`. A hung E2E test (Playwright waiting for a selector that never appears) will burn CI minutes until GitHub's 6-hour default kicks in.

**Fix:** Add `timeout-minutes` to each job:
- lint: 10
- typecheck: 10
- test: 15
- e2e: 20

**Acceptance:**
- [ ] All four jobs have explicit `timeout-minutes`
- [ ] E2E timeout is generous enough for cold starts but bounded (20 min max)

---

### R011 — E2E tests never clean up after the final test run

**Files:** `e2e/critical-path.spec.ts`, `e2e/stripe-upgrade.spec.ts`

**Problem:** Both test files clean up in `beforeEach` (which runs before each test), but there's no `afterAll` cleanup. After the test suite finishes, test data (seeded items, tier changes) remains in the database. Over many CI runs, this accumulates stale test data.

**Why it matters:** The E2E tests use a shared Supabase instance. Leftover data can cause flaky tests and makes the test DB grow unboundedly.

**Fix:**
1. Add `test.afterAll` hooks that call `cleanupUser` for each test user
2. Consider adding a test teardown project to playwright.config.ts that runs after all other projects

**Acceptance:**
- [ ] `afterAll` cleanup exists in each spec file
- [ ] No test data remains after a full `pnpm e2e` run (verify by querying the test DB)

---

### R012 — Search route creates a new Redis client on every request

**File:** `apps/web/app/api/items/search/route.ts` line 29

**Problem:** The search route uses `Redis.fromEnv()` which creates a new `@upstash/redis` client instance on every request. Every other route that uses Redis calls a `getRedis()` factory that could be made into a singleton. While Upstash REST clients are lightweight (no persistent connection), this is inconsistent with the codebase pattern and creates unnecessary object allocation under load.

**Fix:** Replace `Redis.fromEnv()` with the same `getRedis()` lazy singleton pattern used in the register and ingest routes.

**Acceptance:**
- [ ] All Upstash Redis usage goes through the same `getRedis()` factory
- [ ] No `Redis.fromEnv()` calls remain in route handlers

---

## P2 — Fix Soon After Launch

---

### R013 — AI provider hardcodes model names despite .env.example advertising configurability

**Files:** `packages/shared/src/ai-provider.ts`, `.env.example` lines 21–22

**Problem:** `.env.example` includes `AI_MODEL` and `AI_VISION_MODEL` env vars (commented out), implying self-hosted operators can choose which model to use. But the provider implementations hardcode `gpt-4o-mini`, `claude-haiku-4-5-20251001`, and `gemini-1.5-flash`. The env vars are dead.

**Fix:**
1. Accept model name as a constructor parameter: `constructor(apiKey: string, model?: string)`
2. Read `process.env.AI_MODEL` and `process.env.AI_VISION_MODEL` in `createAIProvider()` and pass them to the constructor
3. Default to the current hardcoded values when the env var is unset

**Acceptance:**
- [ ] Setting `AI_MODEL=gpt-4o` in .env changes the model used by OpenAIProvider
- [ ] Default behavior (no env var) is unchanged
- [ ] CONTRIBUTING.md documents the override

---

### R014 — Worker wrapper always passes empty array for existing tags

**File:** `apps/worker/src/lib/openai.ts` line 22

**Problem:** `summarizeEmailBody` calls `getAIProvider().processText(input, [])` — always passing an empty array for `existingTags`. The AI provider interface accepts existing tags so it can suggest tags consistent with the user's vocabulary, but this context is never provided. The user's existing tags are available via a Supabase query but the wrapper doesn't fetch them.

**Fix:** Accept `existingTags: string[]` as a parameter to `summarizeEmailBody` and pass it through. The worker's job processor should query the user's existing tags before calling summarize.

**Acceptance:**
- [ ] `summarizeEmailBody` accepts and forwards existing tags
- [ ] Worker processor queries user's tags and passes them
- [ ] AI responses show improved tag consistency (manual verification)

---

### R015 — E2E auth.setup.ts uses `listUsers()` to find existing users — scans all users

**File:** `e2e/auth.setup.ts` lines 36–37

**Problem:** When `admin.auth.admin.createUser()` fails (user already exists), the fallback calls `admin.auth.admin.listUsers()` which fetches ALL users in the system. As the user count grows, this becomes increasingly slow and wasteful. The Supabase admin API supports `getUserByEmail` or filtering.

**Fix:** Replace the `listUsers()` fallback with a targeted lookup:
```typescript
const { data: existing } = await admin.auth.admin.getUserById(...)
// or catch the specific "already exists" error and extract the user ID from it
```
At minimum, use the `listUsers` pagination with a filter parameter.

**Acceptance:**
- [ ] No unbounded `listUsers()` call in auth.setup.ts
- [ ] Existing user lookup is O(1), not O(n)

---

### R016 — E2E stripe-upgrade.spec.ts seeds 20 items sequentially

**File:** `e2e/stripe-upgrade.spec.ts` lines 20–22

**Problem:** `for (let i = 0; i < 20; i++) { await seedItem(...) }` makes 20 sequential DB inserts. This is slow and makes the test suite take longer than necessary.

**Fix:** Batch the inserts using `Promise.all` or a single bulk insert:
```typescript
await Promise.all(
  Array.from({ length: 20 }, (_, i) =>
    seedItem(freeUserId, { subject: `Item ${i}`, status: 'done' })
  )
)
```
Or better, add a `seedItems(userId, count, overrides)` helper to `e2e/fixtures/seed.ts` that does a single `.insert([...])`.

**Acceptance:**
- [ ] 20-item seed completes in ~1 DB call instead of 20
- [ ] Test execution time for stripe-upgrade spec improves measurably

---

### R017 — db-performance.md documents "expected" query plans but no actual EXPLAIN output

**File:** `docs/db-performance.md`

**Problem:** The S611 ticket required running `EXPLAIN ANALYZE` against the live DB and documenting the results. The document says "Expected plan after S6: Bitmap Index Scan..." — these are predictions, not actual results. Without real EXPLAIN output, there's no proof the indexes are being used.

**Fix:** Run the three queries from the doc against the Supabase DB (even with minimal test data), capture the EXPLAIN ANALYZE output, and paste it into the doc. If the current dataset is too small for Postgres to prefer index scans, note that explicitly.

**Acceptance:**
- [ ] At least one EXPLAIN ANALYZE output is included verbatim
- [ ] Document notes whether Postgres chose seq scan vs index scan and why
- [ ] If data volume is too low for index scans, document the threshold expectation

---

### R018 — Coverage threshold only checks `statements`, ignoring branches

**File:** `vitest.config.ts` lines 16–18

**Problem:** The coverage gate only enforces `statements: 60`. A function that has `if/else` branches can hit 100% statement coverage by only testing one branch. Branch coverage reveals untested conditional logic — particularly important for security-critical code like rate limiting and permission checks.

**Fix:** Add branch coverage threshold:
```typescript
thresholds: {
  statements: 60,
  branches: 50,
},
```
Start with 50% for branches (it's typically lower than statement coverage) and increase over time.

**Acceptance:**
- [ ] `vitest.config.ts` enforces both `statements` and `branches` thresholds
- [ ] `pnpm test:coverage` passes with both thresholds

---

## P3 — Improve When Convenient

---

### R019 — Legal pages not in `(public)` route group as spec'd

**Files:** `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`

**Problem:** The S615 ticket spec called for `apps/web/app/(public)/terms/page.tsx` and `apps/web/app/(public)/privacy/page.tsx`. They were created at `apps/web/app/terms/` and `apps/web/app/privacy/` instead. If there's a `(dashboard)` layout group that adds a sidebar/nav, these pages may inadvertently inherit it. Currently the root layout applies the same chrome everywhere, so this is cosmetic — but it violates the spec and could cause issues when dashboard-specific layouts are added.

**Fix:** Move to the `(public)` route group if one exists or is planned.

**Acceptance:**
- [ ] Privacy and Terms pages render without dashboard chrome
- [ ] Route group matches the project's layout architecture

---

### R020 — CI repeats checkout/install steps across all jobs

**File:** `.github/workflows/ci.yml`

**Problem:** All four jobs (lint, typecheck, test, e2e) repeat the same 4-step sequence: checkout → setup pnpm → setup node → install. This is ~2 minutes of redundant CI time per job (8 min total across 4 parallel jobs). GitHub Actions supports reusable workflows and composite actions to DRY this.

**Fix:** Extract the common setup into a composite action at `.github/actions/setup/action.yml` and call it from each job.

**Acceptance:**
- [ ] Common setup extracted to reusable action
- [ ] All four jobs use the shared action
- [ ] Total CI time reduced by eliminating redundant install steps

---

### R021 — `.dockerignore` doesn't exclude non-essential directories

**File:** `.dockerignore`

**Problem:** The root `.dockerignore` excludes `node_modules`, `.env`, build outputs, and `.git` — but doesn't exclude `e2e/`, `docs/`, `supabase/`, `CONTRIBUTING.md`, `LICENSE`, `README.md`, or `playwright.config.ts`. These are all copied into the Docker build context unnecessarily, slowing down builds.

**Fix:** Add:
```
e2e/
docs/
supabase/
*.md
playwright.config.ts
vitest.config.ts
.github/
```

**Acceptance:**
- [ ] Docker build context is < 50% of the full repo size
- [ ] `docker build` still succeeds with the updated ignore list

---

### R022 — Register rate limit fail-open is a deliberate but undocumented trade-off

**File:** `apps/web/app/api/auth/register/route.ts` lines 29–32

**Problem:** The rate limit on `/api/auth/register` fails open — if Redis is unreachable, registrations proceed without any rate limit. The `security-audit.md` mentions this fact but doesn't flag it as a risk. Rate limiting on registration exists specifically to prevent abuse (brute-force invite codes, email enumeration). Failing open on the one route where abuse prevention is the primary goal is questionable.

**Fix:** Document this as a conscious trade-off in `docs/security-audit.md` with a rationale. Consider:
- Option A: Fail closed (reject with 503 if Redis is down) — safest but blocks legitimate registrations during Redis outage
- Option B: Add an in-memory fallback rate limiter (Map with TTL) that kicks in when Redis is unavailable
- Option C: Keep fail-open but add Sentry alert on Redis failures in this route

At minimum, add the rationale to the security audit doc so the next reviewer understands this was intentional.

**Acceptance:**
- [ ] `docs/security-audit.md` documents the fail-open trade-off with rationale
- [ ] If Option B chosen: in-memory fallback exists and is tested
- [ ] If Option C chosen: Sentry alert or structured log exists for Redis failure on this route

---

## Non-Ticket Observations

These don't warrant tickets but are worth noting:

1. **Privacy page data controller placeholder** — "the operator of this service" needs to be replaced with the founder's real name/company before launch. This is already tracked in S615 and the launch checklist. Founder action required.

2. **S6 perf indexes lost `CONCURRENTLY`** — The fix commit dropped `CONCURRENTLY` from index creation because Supabase CLI runs migrations in transactions. This is correct for the migration pipeline, but the `db-performance.md` doc still references `CREATE INDEX CONCURRENTLY` in its notes. Align the doc with reality.

3. **E2E tests and Playwright projects** — `critical-path.spec.ts` and `stripe-upgrade.spec.ts` use `free-user` storage state but don't explicitly declare which project they belong to via `test.use()`. They'll run against ALL non-setup projects (free-user, pro-user, admin), executing each test 3 times. Either add `test.use({ storageState: '...' })` or assign spec files to projects via `testMatch` in the config.

4. **docker-compose.yml Redis port exposure** — Redis is published on `6379:6379`. For local dev this is handy (allows `redis-cli` from host). For any deployment beyond local dev, this should be removed. Consider adding a comment.

---

## Sprint 6 Score Card

| Area | Grade | Notes |
|---|---|---|
| E2E test suite | B | Good coverage of critical paths, but missing cleanup, sequential seeding, project assignment |
| CI pipeline | B- | Functional but no timeouts, redundant setup, E2E skipped on main pushes |
| Docker setup | C | Will not work out of the box (missing HOSTNAME), no healthchecks, deprecated syntax |
| AI provider abstraction | C | Interface is clean but implementation has no error handling, no timeouts, hardcoded models |
| Security pass | A- | Thorough audit, all P0 findings applied, good documentation |
| Legal pages | B+ | Substantive content, GDPR-compliant structure, placeholder data controller noted |
| Documentation | B | Comprehensive but placeholder URLs, missing EXPLAIN output |
| DB indexes | A | Correct indexes, well-documented, migration works |

**Overall:** Solid sprint for breadth of delivery. The primary concern is the AI provider implementation — it's the most critical integration in the system and currently has no error handling, no timeouts, and thin test coverage. Fix R001–R004 before any production traffic.
