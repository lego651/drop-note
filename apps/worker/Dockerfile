FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

RUN pnpm install --frozen-lockfile --filter @drop-note/worker...
RUN pnpm --filter @drop-note/worker build

FROM node:20-alpine AS runner
WORKDIR /app

# tsup bundles @drop-note/shared inline — only need npm packages + compiled output
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

CMD ["node", "dist/index.js"]
