FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/worker/package.json ./apps/worker/package.json
RUN pnpm install --frozen-lockfile --filter @drop-note/worker...

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker
COPY tsconfig.base.json ./
RUN pnpm --filter @drop-note/shared build 2>/dev/null || true
RUN pnpm --filter @drop-note/worker build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/apps/worker/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
CMD ["node", "dist/index.js"]
