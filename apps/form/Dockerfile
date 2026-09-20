# The questionnaire: a static Vite bundle served by nginx, which also proxies
# the two API paths to the cms container (nginx.conf). Build context is the
# monorepo root. Nothing is baked at build — the API is same-origin.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

# The lockfile pins every version — without it a rebuild resolves "^x.y" afresh
# (2026-09-20: payload 3.90 instead of the locked 3.85 broke every users read in prod).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
# pnpm patches (package.json → patchedDependencies) must exist at install time
COPY patches patches
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/form/package.json apps/form/
RUN pnpm install --filter @cosimo/form... --no-frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/ui packages/ui
COPY apps/form apps/form

RUN pnpm --filter @cosimo/form run build

FROM nginx:alpine
COPY apps/form/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/form/dist /usr/share/nginx/html
EXPOSE 80
