# Staff console (/host + /seat): a static Vite bundle served by nginx. Build context is the
# monorepo root. The realtime URL is baked at build time (VITE_REALTIME_URL)
# because the bundle is static — the page can still be repointed at runtime
# with ?server=… .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/face/package.json packages/face/
COPY packages/client/package.json packages/client/
COPY packages/seat-ui/package.json packages/seat-ui/
COPY apps/console/package.json apps/console/
RUN pnpm install --filter @cosimo/console... --no-frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/face packages/face
COPY packages/client packages/client
COPY packages/seat-ui packages/seat-ui
COPY apps/console apps/console

ARG VITE_REALTIME_URL
ENV VITE_REALTIME_URL=$VITE_REALTIME_URL
RUN pnpm --filter @cosimo/console run build

FROM nginx:alpine
COPY apps/console/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/console/dist /usr/share/nginx/html
EXPOSE 80
