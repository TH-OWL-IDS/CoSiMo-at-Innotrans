# Payload CMS + Next.js (admin + /host console). Build context is the monorepo root.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Install workspace deps (manifests first for layer caching).
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY apps/cms/package.json apps/cms/
RUN pnpm install --filter @cosimo/cms... --no-frozen-lockfile

# Sources.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/client packages/client
COPY apps/cms apps/cms

WORKDIR /app/apps/cms
RUN pnpm run build

EXPOSE 3001
CMD ["pnpm", "run", "start"]
