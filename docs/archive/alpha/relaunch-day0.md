# drop-note Relaunch — Day 0 Execution Pack

**Date:** 2026-05-25  
**Status:** 路 A 确认执行。house-os 关停，drop-note 升 #1 产品优先级。  
**By:** Mic (drop-note product owner)

---

## Summary

Jason 已口头授权：house-os 砍了，drop-note 升 #1（trading #0 不变）。本文档是今晚和接下来 3 周的完整执行包：

- **Section 1:** DNS 配置清单（Jason 今晚 Porkbun 操作，30 分钟）
- **Section 2:** Jose brief（已发，路径：`docs/jose-brief-relaunch.md`）
- **Section 3:** Jason 今晚 30 分钟 checklist

---

## Section 1 — DNS 配置清单（Porkbun clipboard-ready）

域名：`dropnote.me`  
域名注册商：Porkbun

**重要前置说明：**
- `dropnote.me` 的 apex 用 **A 记录**（Vercel 2026 年官方推荐：外部注册商 → A 记录指向 `76.76.21.21`）
- SendGrid Inbound Parse 必须用**子域**（`inbound.dropnote.me`），不能用 apex，否则会和发件 MX 冲突
- Resend 的 SPF 只需一条 TXT，DKIM 需要 Resend 控制台生成后回填（占位先留着）
- DMARC 放 apex 的 `_dmarc.dropnote.me`

---

### 1.1 Vercel（网站托管）

```
Type:  A
Name:  @
Value: 76.76.21.21
TTL:   600
Why:   apex 域名 dropnote.me 指向 Vercel（官方推荐 A 记录，非 ALIAS/ANAME）
```

```
Type:  CNAME
Name:  www
Value: cname.vercel-dns.com
TTL:   600
Why:   www.dropnote.me → Vercel，Vercel 会自动配 www→apex 重定向
```

---

### 1.2 SendGrid Inbound Parse（接收邮件 drop@inbound.dropnote.me）

> 注意：用子域 `inbound.dropnote.me`，不用 apex。SendGrid 官方说"该 hostname 除收件外不得有其他用途"。用子域可以让 apex 留给 Resend 发件 SPF，避免 MX 冲突。

```
Type:  MX
Name:  inbound
Value: mx.sendgrid.net
Priority: 10
TTL:   600
Why:   将发往 *@inbound.dropnote.me 的邮件路由到 SendGrid
       实际接收地址：drop@inbound.dropnote.me
       SendGrid webhook 配置里的 Hostname 填 inbound.dropnote.me
```

> **关于 drop 地址变化：** 用户看到的 drop 地址从 `drop@dropnote.com` 变成 `drop@inbound.dropnote.me`（用户友好显示可以缩写成 `drop@dropnote.me`，但实际发件目标是 `drop@inbound.dropnote.me`）。Jose brief 里已要求 Jose 处理这个细节——env var `NEXT_PUBLIC_DROP_ADDRESS` 统一更新。

---

### 1.3 Resend（发件验证：SPF + DKIM + DMARC）

**SPF（发件授权）：**
```
Type:  TXT
Name:  @
Value: v=spf1 include:_spf.resend.com ~all
TTL:   600
Why:   授权 Resend 代表 dropnote.me 发送邮件（welcome email、cap 提醒等）
```

**DKIM（先占位，Resend 控制台生成后回填）：**

去 Resend 控制台 → Domains → Add Domain → 输入 `dropnote.me` → 它会给你 1 条 DKIM CNAME 记录（selector 名称格式通常是 `resend._domainkey`）：

```
Type:  CNAME
Name:  resend._domainkey        ← Resend 给的实际 selector，回填这里
Value: [Resend 控制台提供的值]    ← 例如 resend._domainkey.rsnd.net 或类似值
TTL:   600
Why:   DKIM 签名验证，防止 Resend 发出的邮件被标为垃圾邮件
```

**DMARC（反冒充保护）：**
```
Type:  TXT
Name:  _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:postmaster@dropnote.me
TTL:   600
Why:   告诉收件方：如果一封声称来自 @dropnote.me 的邮件没有通过 SPF/DKIM，
       隔离它（quarantine）。rua 收取 DMARC 报告。
       p=quarantine 比 p=reject 更安全，适合初期部署。
```

---

### 1.4 汇总表（Porkbun 后台操作顺序）

| # | Type | Name | Value | Priority | TTL |
|---|------|------|-------|----------|-----|
| 1 | A | @ | 76.76.21.21 | — | 600 |
| 2 | CNAME | www | cname.vercel-dns.com | — | 600 |
| 3 | MX | inbound | mx.sendgrid.net | 10 | 600 |
| 4 | TXT | @ | v=spf1 include:_spf.resend.com ~all | — | 600 |
| 5 | CNAME | resend._domainkey | [Resend 控制台提供] | — | 600 |
| 6 | TXT | _dmarc | v=DMARC1; p=quarantine; rua=mailto:postmaster@dropnote.me | — | 600 |

**总计：6 条记录。Record #5 需要先去 Resend 拿 value，其余 5 条可以立刻填。**

---

## Section 2 — Jose Brief（见 docs/jose-brief-relaunch.md）

已发送至 Jose。覆盖：
- A. Domain migration：代码库 `dropnote.com` → `dropnote.me`（13 个源文件清单）
- B. 4 个 pre-launch blockers：AI 错误处理、Dockerfile HOSTNAME、Legal pages
- C. Weekly Resurface Digest（新 MVP 功能，BullMQ + Resend + React Email）
- D. 明确不做的事（不重构、不动 Stripe、不加 dependency）
- E. 验收标准（每个 task 有可执行的 pass/fail 测试）
- F. 时间线（Day 1-21，21 天到发布准备）

---

## Section 3 — Jason 今晚 30 分钟 Checklist

> 前提：trading 结束后，找个安静的 30 分钟。按顺序来。

### Step 1 — Porkbun DNS 配置（约 10 分钟）

1. 登录 [porkbun.com](https://porkbun.com) → 找到 `dropnote.me` → DNS Records
2. 按 Section 1.4 汇总表填入 6 条记录
3. Record #5（DKIM）先跳过，等 Step 4 拿到 value 后回来填

**文档：** Porkbun DNS 管理界面直接操作，无需额外文档。

---

### Step 2 — Vercel Dashboard 加 Custom Domain（约 5 分钟）

1. 登录 [vercel.com/dashboard](https://vercel.com/dashboard) → 找到 drop-note 项目
2. Settings → Domains → Add Domain
3. 输入 `dropnote.me` → Vercel 会提示你加 A 记录（你已经在 Step 1 加了）
4. 再加 `www.dropnote.me` → Vercel 会提示 CNAME（你已经加了）
5. 等 Vercel 验证（通常 5-10 分钟，DNS TTL 600s）

**文档：** https://vercel.com/docs/domains/add-a-domain

---

### Step 3 — SendGrid Inbound Parse 配置（约 5 分钟）

1. 登录 [app.sendgrid.com](https://app.sendgrid.com) → Settings → Inbound Parse → Add Host & URL
2. Hostname：`inbound.dropnote.me`
3. URL：`https://dropnote.me/api/ingest?key=YOUR_SENDGRID_WEBHOOK_SECRET`（`YOUR_SENDGRID_WEBHOOK_SECRET` 用你 `.env.local` 里的 `SENDGRID_WEBHOOK_SECRET` 值）
4. Check "POST the raw, full MIME message"（根据 worker 代码需求确认）
5. Save

**文档：** https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook

---

### Step 4 — Resend 添加 Domain 拿 DKIM Selector（约 5 分钟）

1. 登录 [resend.com](https://resend.com) → Domains → Add Domain
2. 输入 `dropnote.me`
3. Resend 会显示你需要添加的 DNS 记录（SPF + DKIM）——复制 DKIM CNAME 的 Name 和 Value
4. 回到 Porkbun，填入 Record #5（CNAME，`resend._domainkey`，Resend 给的 value）
5. 点 Resend 的 "Verify DNS Records"

**文档：** https://resend.com/docs/dashboard/domains/introduction

---

### Step 5 — 告诉 Mic 完成（约 1 分钟）

回复 "@Mic DNS 配好了"，我来触发 Jose 开始执行 domain migration 代码工作，以及安排下一步 Vercel env vars 更新。

---

### 时间预估汇总

| Step | 内容 | 预估时间 |
|------|------|---------|
| 1 | Porkbun DNS | 10 min |
| 2 | Vercel custom domain | 5 min |
| 3 | SendGrid Inbound Parse | 5 min |
| 4 | Resend domain + 回填 DKIM | 5 min |
| 5 | 告知 Mic | 1 min |
| **合计** | | **约 26 分钟** |

---

## 锁定决策回顾

| 决策 | 来源 |
|------|------|
| D1 — 付费层已关闭，100 用户触发 $4.99 重启 | 2026-04-02 |
| D2 — Omnivore 替代品定位，不跟 Readwise 正面竞争 | 2026-04-02 |
| D6 — 发布暂停改为"积极推进"，Jason 本周专注 drop-note | 2026-05-25 |
| D9 — 域名 = dropnote.me（Porkbun，$5 首年） | 2026-05-25 |
| D10 — house-os 关停，drop-note 升 #1 产品 | 2026-05-25 |
