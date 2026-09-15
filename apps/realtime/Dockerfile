# Realtime/agent service. Build context is the monorepo root.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Install workspace deps (manifests first for layer caching).
COPY pnpm-workspace.yaml package.json ./
# pnpm patches (package.json → patchedDependencies) must exist at install time
COPY patches patches
COPY packages/shared/package.json packages/shared/
COPY apps/realtime/package.json apps/realtime/
RUN pnpm install --filter @cosimo/realtime... --no-frozen-lockfile

# Sources.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/realtime apps/realtime

EXPOSE 6101
# Run via tsx so the workspace TS (incl. @cosimo/shared) resolves without a
# separate build step — fine for the showcase service.
CMD ["pnpm", "--filter", "@cosimo/realtime", "run", "start"]
