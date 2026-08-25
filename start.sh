#!/usr/bin/env bash
# Production start on the VPS — the ONE way to bring the stack up.
#
# Without the overlays, docker-compose.yml alone is the DEV configuration:
# ports 0.0.0.0:6100–6104 (Postgres publicly on :5432!), realtime outside the
# Tailscale namespace, no GX10. The Cloudflare tunnel points at
# 127.0.0.1:622x, so a bare `docker compose up` shows "Bad Gateway" (seen
# 2026-08-25). This script always passes prod + tailnet overlays and
# .env.prod. Extra args go to compose: ./start.sh cms realtime
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env.prod ] || { echo "start.sh: .env.prod missing (copy from .env.example)"; exit 1; }
exec docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.tailnet.yml \
  --env-file .env.prod \
  up -d --build --remove-orphans "$@"
