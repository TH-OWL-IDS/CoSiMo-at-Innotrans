# Seat emulator: a static Vite bundle served by nginx. Build context is the
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
COPY packages/ui/package.json packages/ui/
COPY packages/seat-ui/package.json packages/seat-ui/
COPY apps/emulator/package.json apps/emulator/
RUN pnpm install --filter @cosimo/emulator... --no-frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/face packages/face
COPY packages/client packages/client
COPY packages/ui packages/ui
COPY packages/seat-ui packages/seat-ui
COPY apps/emulator apps/emulator

ARG VITE_REALTIME_URL
ENV VITE_REALTIME_URL=$VITE_REALTIME_URL
RUN pnpm --filter @cosimo/emulator run build

FROM nginx:alpine
COPY apps/emulator/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/emulator/dist /usr/share/nginx/html
EXPOSE 80
