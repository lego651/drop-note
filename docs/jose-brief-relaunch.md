# Jose Brief — drop-note Relaunch Sprint

**From:** Mic (drop-note product owner)  
**To:** Jose (techlead)  
**Date:** 2026-05-25  
**Priority:** P0 — Jason 已口头授权，drop-note 升 #1 产品优先级，house-os 关停  
**Timeline:** 21 天到发布准备（Day 1 = 2026-05-26）

---

## Context

Sprints 0–6 完成，app ~85–90% production-ready。今天 Jason 拍板：house-os 关停，drop-note 本周立刻推进。域名 `dropnote.me` 已购（D9，Porkbun $5 首年）。Jason 今晚配 DNS。你的任务是让代码追上这个决定，并补上 4 个 pre-launch blockers + 1 个 MVP 新功能。

**不要做：** 不重构、不做 tech debt cleanup、不动 Stripe 代码（null-checked 保持现状）、不加新 npm dependency（除非 Weekly Digest 需要 `react-email` 相关包，那是明确授权的）、不碰 trading 相关任何东西。

---

## Task A — Domain Migration（dropnote.com → dropnote.me）

**估时：** 2-3 小时  
**优先级：** 第一个做。最简单，建立信心，解锁后续配置。

### 目标

全代码库的 `dropnote.com` 引用替换为 `dropnote.me`。

### 需要修改的源文件（主库，非 worktrees）

| 文件 | 改动内容 |
|------|---------|
| `.env.example` | `RESEND_FROM_ADDRESS` 里的 `@dropnote.com` → `@dropnote.me`；`NEXT_PUBLIC_DROP_ADDRESS` → `drop@inbound.dropnote.me` |
| `apps/web/app/robots.ts` | fallback URL `https://dropnote.com` → `https://dropnote.me` |
| `apps/web/app/sitemap.ts` | fallback URL `https://dropnote.com` → `https://dropnote.me` |
| `apps/web/app/privacy/page.tsx` | `drop@dropnote.com` → `drop@inbound.dropnote.me`；`legal@dropnote.com` → `legal@dropnote.me` |
| `apps/web/app/terms/page.tsx` | `drop@dropnote.com` → `drop@inbound.dropnote.me`；`legal@dropnote.com` → `legal@dropnote.me` |
| `apps/web/app/(dashboard)/settings/SettingsClient.tsx` | `drop@dropnote.com` → `drop@inbound.dropnote.me`（含 clipboard copy 字符串，×2） |
| `apps/web/components/dashboard/onboarding-panel.tsx` | `drop@dropnote.com` env fallback → `drop@inbound.dropnote.me` |
| `apps/web/components/items/ItemsPageClient.tsx` | `drop@dropnote.com` → `drop@inbound.dropnote.me`（×2，含 clipboard copy） |
| `apps/web/lib/email.ts` | `hello@dropnote.com` → `hello@dropnote.me`；`drop@dropnote.com` → `drop@inbound.dropnote.me`；fallback URL → `https://dropnote.me` |
| `apps/web/lib/emails/cap-exceeded.ts` | `noreply@dropnote.com` → `noreply@dropnote.me`；fallback URL → `https://dropnote.me` |
| `apps/web/lib/emails/save-limit-exceeded.ts` | `noreply@dropnote.com` → `noreply@dropnote.me`；fallback URL → `https://dropnote.me` |
| `README.md` | `drop@dropnote.com` → `drop@inbound.dropnote.me`；`dropnote.com` 链接 → `dropnote.me` |
| `CLAUDE.md` | `drop@dropnote.com` → `drop@inbound.dropnote.me`（×2，说明文档） |

### 关于 drop 地址的特殊说明

SendGrid Inbound Parse 用子域 `inbound.dropnote.me`（DNS MX 记录在 `inbound` subdomain）。所以实际接收地址是 `drop@inbound.dropnote.me`。

用户界面里建议显示逻辑：
- 给用户看的 copy 文案写 `drop@inbound.dropnote.me`（真实可用地址）
- 如果 `NEXT_PUBLIC_DROP_ADDRESS` env var 已设置，用 env var（这是首选，让 Jason 在 Vercel env 里设置 `NEXT_PUBLIC_DROP_ADDRESS=drop@inbound.dropnote.me`）

### 不要改的文件（历史文档）

- `docs/s1-tickets.md`、`docs/s2-tickets.md` 等 sprint 历史文档里的 `dropnote.com` 引用保持原样。这些是历史记录，不是运行代码。
- `docs/v2-per-user-routing.md` 里的 v2 spec 保持原样（v2 未激活）。
- `docs/architecture/email-pipeline.md` 里的示意图更新即可（改地址）。

### 验收标准

```bash
# 在主库根目录运行，应该 0 结果（排除 docs/ 历史文档和 .claude/worktrees/）
grep -r "dropnote\.com" \
  --include="*.ts" --include="*.tsx" --include="*.example" \
  --exclude-dir=".claude" --exclude-dir="docs" \
  /Users/lego/@Lego651/drop-note
# 期望：无输出（0 hits）
```

---

## Task B — AI 错误处理（P0 Blocker #2）

**估时：** 1-2 天  
**优先级：** 第二个做

### 问题描述

当前 worker 在 AI summarization 失败时（OpenAI 5xx、超时、请求体过大）会直接让 job 失败，导致：
1. Item 可能没有存下来，或者 status 标成 `failed`，用户看到红字
2. 没有重试逻辑区分可重试（5xx、网络超时）和不可重试（内容超长 400 错误）错误
3. 没有 Sentry 上报

### 期望行为（acceptance criteria）

- **Item 永远存下来**：无论 AI 成功还是失败，原始内容（subject、from、body_text、附件等）必须存入 `items` 表
- **Status 逻辑**：
  - AI 成功 → `status = 'done'`，summary 和 tags 正常填充
  - AI 失败（可重试，如 5xx/超时）→ `status = 'pending'`，进入 retry queue，summary 填占位："AI summary temporarily unavailable. Your content has been saved."
  - AI 失败（不可重试，如内容过长/格式不支持 400）→ `status = 'error'`，summary 填："AI summary unavailable for this content type. Original content saved."，`error_message` 字段记录原始错误
- **Retry 逻辑**：可重试错误最多重试 3 次，指数退避（1s, 4s, 16s），3 次后降级为 `status = 'error'`
- **Sentry 上报**：每次 AI 调用失败都发 Sentry event，包含 item_id、error_type、retry_count
- **单元测试**：mock OpenAI 返回 500，验证：item 存入 DB，status = 'pending'，Sentry 收到 event

### 技术实现建议（最简路径）

在 worker 的 AI 调用点包裹 `retryWithBackoff` helper：
```typescript
// 伪代码方向，实现方式 Jose 自己决定
async function callAIWithRetry(prompt: string, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(openai_endpoint, { signal: AbortSignal.timeout(30_000) })
    if (response.ok) return await response.json()
    if (response.status >= 500 && attempt < maxRetries) {
      await sleep(Math.pow(4, attempt) * 1000)
      continue
    }
    throw new AIError(response.status, await response.text(), attempt === maxRetries)
  }
}
```

Jose，你熟悉 worker 代码，具体实现自己判断最简路径。不要过度设计。

---

## Task C — Dockerfile HOSTNAME Fix（P0 Blocker #3）

**估时：** 1-2 小时  
**优先级：** 可和 Task A 并行

### 问题

Worker 的 Dockerfile 缺少 `HOSTNAME` 环境变量设置。Next.js（以及可能的 worker health check endpoint）在容器内绑定到 `localhost`，Railway 的外部 health check 打不通，deploy 显示失败。

### 修法

在 `apps/worker/Dockerfile`（或 worker 的启动配置）中，确保进程监听 `0.0.0.0`：

```dockerfile
ENV HOSTNAME=0.0.0.0
```

如果 worker 用的是自定义 HTTP server 做 health check endpoint，确认 server 绑定 `0.0.0.0:PORT` 而不是 `127.0.0.1:PORT`。

### 验收标准

- Railway preview deploy 的 health check 状态变绿（不再报 "Service unavailable"）
- `docker compose up` 在本地机器上的 health check 通过

---

## Task D — Legal Pages（P0 Blocker #4）

**估时：** 1 天  
**优先级：** 和 Task B 并行（Day 3-5）

### 需要的 3 个页面

`/privacy`、`/terms`、`/aup`（Acceptable Use Policy）

### 现状

`apps/web/app/privacy/page.tsx` 和 `apps/web/app/terms/page.tsx` 已有路由和占位内容，但内容是占位符，不满足 GDPR + Stripe 要求。`/aup` 路由不存在，需要新建。

### 内容要求

**Privacy Policy（`/privacy`）：**
- Data controller: Jason Gao（个人，非 LEDOO FORTUNE FINANCIAL INC.）
- 联系邮箱：`legal@dropnote.me`
- 收集数据：email 地址、邮件内容、AI 处理后的摘要和标签
- 数据用途：提供服务（content summarization and tagging）
- 数据存储：Supabase（Postgres），托管在 AWS us-east-1
- 数据保留：账户删除后 30 天内清除
- 用户权利：可要求删除所有数据（发邮件给 legal@dropnote.me）
- AGPL 说明：self-host 版本用户自行控制数据
- 无第三方营销分享
- GDPR Article 13 disclosures（如果用户在 EU）
- 语言：英文

**Terms of Service（`/terms`）：**
- 服务描述：email-to-dashboard content saver，AGPL-3.0 开源
- Free tier 限制：50 items（可能会调整）
- 禁止滥用：spam、illegal content、scraping
- DMCA 联系：`legal@dropnote.me`
- 服务方：Jason Gao
- 语言：英文

**Acceptable Use Policy（`/aup`）—— 新建路由：**
- `apps/web/app/aup/page.tsx`（模仿 privacy/terms 的现有结构新建）
- 内容：明确禁止 spam、phishing、illegal content、mass email scraping
- 违规后果：账号删除
- 报告方式：`legal@dropnote.me`

### 实现方式

内容参考 GitHub 上成熟的 open-source SaaS privacy policy 模板（如 Basecamp、Plausible 的开源模板）。不需要律师 review（pre-launch 阶段，post-100-user 再说）。内容风格：简洁、人性化、AGPL self-host 友好（避免"我们拥有你的数据"类表述）。

### 验收标准

```bash
curl -o /dev/null -s -w "%{http_code}" https://dropnote.me/privacy   # → 200
curl -o /dev/null -s -w "%{http_code}" https://dropnote.me/terms     # → 200
curl -o /dev/null -s -w "%{http_code}" https://dropnote.me/aup       # → 200
```

页面内容包含 "Jason Gao" 和 "legal@dropnote.me"（不是占位符）。

---

## Task E — Weekly Resurface Digest（新 MVP 功能）

**估时：** 2-3 天  
**优先级：** Day 6-10（在 blockers 修完之后）

### 产品意图

每周一发一封邮件，让用户重新发现自己存的内容。这是 drop-note 的核心差异化：不只是存，还帮你"记住"。

> 来源：drop-note-final-positioning.html § "Weekly Digest"，已被 Mic 升级为 MVP 必做。

### 邮件内容规格

**发送时间：** 每周一 09:00 UTC（Edmonton 用户本地是周一凌晨 03:00，OK，他们看到的是周一早上到收件箱）

**邮件结构：**
1. Header：`"Your drop-note digest — week of [日期]"`
2. 本周统计：`"You saved N items this week"`（如果 N=0，跳过本周发送，不发空邮件）
3. "This week's highlights"：从本周新存的 items 里，选 3 条（selection 逻辑见下）
4. "Resurface"：从 30+ 天前存的 items 里，随机选 2 条（"Remember this?"）
5. Footer：dashboard 链接 + unsubscribe 链接（`/settings#email-preferences`）

**V1 selection 逻辑（不要上 AI 排序，V2 再说）：**
- "highlights"：`status = 'done'` + `created_at` 在过去 7 天内 + 按 `summary` 字段长度降序（摘要越长内容越丰富）+ 取前 3
- "resurface"：`status = 'done'` + `created_at` 在 30+ 天前 + `deleted_at IS NULL` + `pinned = false`（避免重复推已 pin 的） + 随机排序 + 取前 2

**用户控制：**
- 新字段：`users.digest_enabled boolean DEFAULT true`——用户可以在 `/settings` 关闭
- 如果 `digest_enabled = false`，跳过该用户

### 技术实现

**DB migration（需要一个新 migration 文件）：**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT true;
```

**Worker side（BullMQ）：**
- 新 job type：`send-weekly-digest`
- BullMQ `cron` option：`repeat: { cron: '0 9 * * 1' }`（每周一 09:00 UTC）
- Job processor：
  1. 查所有 `digest_enabled = true` 的用户（分批处理，每批 50 人，避免内存炸掉）
  2. 对每个用户：查本周 items（highlights）+ 查 30 天前 items（resurface）
  3. 如果 highlights count = 0，跳过该用户
  4. 用 Resend 发邮件

**Email template（React Email）：**
- 新文件：`packages/shared/src/emails/weekly-digest.tsx`（用 React Email 组件）
- 或者放在 `apps/worker/src/emails/weekly-digest.tsx`——Jose 判断哪里更合适
- 样式：简洁、移动端友好，和现有 `cap-exceeded.ts` 邮件风格一致

**Settings UI（小改动）：**
- 在 `apps/web/app/(dashboard)/settings/SettingsClient.tsx` 里加一个 toggle：
  - Label: "Weekly digest email"
  - Description: "Get a weekly recap of your saved content, including highlights and resurfaces."
  - 绑定 `users.digest_enabled` 字段，即时保存

### 验收标准

1. DB migration 跑完后 `users` 表有 `digest_enabled` 列，默认 true
2. 手动触发 digest job（通过 BullMQ Admin 或 `queue.add()` 一次性调用）
3. 向 `jasonusca@gmail.com`（Jason 的邮件）发送测试 digest 邮件，Resend test mode
4. 邮件包含：header、本周 N 条统计、highlights 列表（item title + summary excerpt）、resurface 列表
5. `digest_enabled = false` 的用户不收到邮件（可在 DB 里手动设一个测试用户验证）
6. BullMQ cron job 出现在 queue 列表里，next run 时间正确

---

## 不在 Brief 里的（明确不做）

- 不要重构现有代码（tech debt cleanup 不是本次目标）
- 不要动 Stripe 代码（null-checked SDK init 保持现状，付费层未启用）
- 不要加未经授权的 npm dependency（Weekly Digest 可以加 `react-email` 相关包，其他需要提前说）
- 不要碰 `e2e/` Playwright 测试（除非某个 blocker fix 破坏了现有 smoke test）
- 不要碰 trading 相关任何东西

---

## 时间线

| 阶段 | Day | 内容 |
|------|-----|------|
| 快速胜利 | Day 1-2 | Task A（domain migration）+ Task C（Dockerfile HOSTNAME） |
| Blockers | Day 3-5 | Task B（AI 错误处理）+ Task D（Legal pages） |
| MVP 功能 | Day 6-10 | Task E（Weekly Digest） |
| QA | Day 11-15 | 整体 QA + Jason dogfood + preview deploy |
| 发布准备 | Day 16-21 | Show HN 草稿、README polish、Product Hunt assets |

---

## 验收汇总（Jose 完成后需要向 Mic 汇报）

1. **Domain migration:** `grep -r "dropnote\.com" --include="*.ts" --include="*.tsx" --exclude-dir=docs --exclude-dir=.claude /path/to/repo` = 0 hits
2. **AI 错误处理:** unit test 通过——mock OpenAI 500 → item saved, status = 'pending', Sentry event sent
3. **Dockerfile:** Railway preview deploy health check 绿色
4. **Legal pages:** `/privacy`, `/terms`, `/aup` 各返回 200，内容包含 "Jason Gao" 和 "legal@dropnote.me"
5. **Weekly Digest:** Resend test 模式向 `jasonusca@gmail.com` 发送成功，邮件格式符合规格

---

## 文件路径参考

主要改动文件集中在：
- `/Users/lego/@Lego651/drop-note/apps/web/`
- `/Users/lego/@Lego651/drop-note/apps/worker/`
- `/Users/lego/@Lego651/drop-note/packages/shared/`
- `/Users/lego/@Lego651/drop-note/supabase/migrations/`（Task E 需要新 migration）
- `/Users/lego/@Lego651/drop-note/.env.example`
- `/Users/lego/@Lego651/drop-note/README.md`
- `/Users/lego/@Lego651/drop-note/CLAUDE.md`

Commit prefix 规则（per `CLAUDE.md`）：`[bug]` 用于 blockers 修复，feature 工作用 `[s7]`（如果 Jason 要开新 sprint 编号）或 `[bug]`。

---

Mic out. Jose，有任何架构判断需要拍板，ping 我。
