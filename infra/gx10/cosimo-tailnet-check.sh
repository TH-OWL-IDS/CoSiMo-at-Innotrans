#!/usr/bin/env bash
# Watchdog for CoSiMo's brain on the GX10 — run from the user's crontab every
# minute (no sudo on this box). The stack carries its own tailnet membership
# (sidecar `cosimo-tailscale`); the model lives in that namespace. Checks:
#   1. the sidecar is running and has a tailnet IP;
#   2. cosimo-llm is running;
#   3. vLLM answers /health on the sidecar's tailnet IP (what the VPS sees).
# Missing containers are brought back with `docker compose up -d`.
# Logs one line per change to ~/cosimo-ai/check.log; silent while healthy.
set -u
cd "$(dirname "$0")"
LOG=./check.log
STATE=./.check.state
note() { echo "$(date -Is) $*" >> "$LOG"; }
status="ok"

running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }

if ! running cosimo-tailscale; then
  docker compose up -d >/dev/null 2>&1
  status="tailscale-sidecar-missing (started)"
else
  ip=$(docker exec cosimo-tailscale tailscale ip -4 2>/dev/null | head -1)
  if [ -z "$ip" ]; then
    status="tailnet-down (sidecar has no ip — auth key? see docker logs cosimo-tailscale)"
  elif ! running cosimo-llm; then
    docker compose up -d >/dev/null 2>&1
    status="llm-container-missing (started)"
  elif ! docker exec cosimo-tailscale wget -qO- --timeout=5 "http://$ip:8007/health" >/dev/null 2>&1; then
    if docker inspect cosimo-llm --format '{{.State.Health.Status}}' 2>/dev/null | grep -q starting; then
      status="llm-starting"
    else
      status="llm-unhealthy"
    fi
  fi
  [ -n "$ip" ] && echo "$ip" > ./.tailnet-ip
fi

prev=$(cat "$STATE" 2>/dev/null || echo "")
if [ "$status" != "$prev" ]; then
  note "$status"
  echo "$status" > "$STATE"
fi
