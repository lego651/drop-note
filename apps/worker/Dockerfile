FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app

# Copy workspace manifests + source (needed before install so pnpm resolves workspace deps)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

# Install worker deps (workspace:* links packages/shared automatically)
RUN pnpm install --frozen-lockfile --filter @drop-note/worker...

# Build worker
RUN pnpm --filter @drop-note/worker build

FROM node:20-alpine AS runner
WORKDIR /app

# Copy compiled output
COPY --from=builder /app/apps/worker/dist ./dist

# Copy node_modules (pnpm virtual store with symlinks) + shared source (symlink target)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared

CMD ["node", "dist/index.js"]
