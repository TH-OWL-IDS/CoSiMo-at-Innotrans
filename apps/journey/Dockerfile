# Journey view: a static Vite bundle served by nginx. Build context is the
# monorepo root; VITE_REALTIME_URL is baked at build (static bundle).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
# pnpm patches (package.json → patchedDependencies) must exist at install time
COPY patches patches
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/ui/package.json packages/ui/
COPY apps/journey/package.json apps/journey/
RUN pnpm install --filter @cosimo/journey... --no-frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/client packages/client
COPY packages/ui packages/ui
COPY apps/journey apps/journey

ARG VITE_REALTIME_URL
ENV VITE_REALTIME_URL=$VITE_REALTIME_URL
RUN pnpm --filter @cosimo/journey run build

FROM nginx:alpine
COPY apps/journey/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/journey/dist /usr/share/nginx/html
EXPOSE 80
