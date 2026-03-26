FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

# Install all deps (including devDeps needed for tsup)
RUN pnpm install --frozen-lockfile --filter @drop-note/worker...

# Build — tsup bundles @drop-note/shared inline
RUN pnpm --filter @drop-note/worker build

# Create a standalone deployment with flat, symlink-free node_modules
RUN pnpm deploy --filter @drop-note/worker --prod --legacy /deploy

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# /deploy/node_modules is flat — no pnpm virtual store, no symlinks
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./dist

CMD ["node", "dist/index.js"]
