# Payload CMS + Next.js (admin + /host console). Build context is the monorepo root.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Install workspace deps (manifests first for layer caching).
COPY pnpm-workspace.yaml package.json ./
# pnpm patches (package.json → patchedDependencies) must exist at install time
COPY patches patches
COPY packages/shared/package.json packages/shared/
COPY apps/cms/package.json apps/cms/
RUN pnpm install --filter @cosimo/cms... --no-frozen-lockfile

# Sources.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/cms apps/cms

WORKDIR /app/apps/cms
# Explicit: anything run in this image (next start, but also `pnpm run seed`
# via docker exec) must be production — without this, a seed run put Payload
# in dev mode, PUSHED schema and wrote the 'dev' marker row, which makes the
# next boot's `payload migrate` hang on an interactive prompt (2026-08-24).
ENV NODE_ENV=production
# NEXT_PUBLIC_SERVER_URL is inlined into the client bundle at build time, so
# it must be a build arg (compose passes it).
ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
RUN pnpm run build

EXPOSE 6100
# Apply pending Payload migrations, then serve. Dev keeps push mode; prod
# schema changes MUST ship as a migration (payload migrate:create).
CMD ["sh", "-c", "pnpm run migrate && pnpm run start"]
