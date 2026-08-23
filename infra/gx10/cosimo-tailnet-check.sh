#!/usr/bin/env bash
# Watchdog for CoSiMo's brain on the GX10 — run from the user's crontab every
# minute (no sudo on this box). Checks, in order:
#   1. tailscaled is up and the node has its tailnet IP;
#   2. cosimo-llm is running and bound to that IP;
#   3. vLLM answers /health on the tailnet IP.
# A container that exists but isn't bound to the (current) tailnet IP is
# restarted — that is what happens if the node is ever re-registered.
# Logs one line per change to ~/cosimo-ai/check.log; silent while healthy.
set -u
cd "$(dirname "$0")"
LOG=./check.log
STATE=./.check.state
note() { echo "$(date -Is) $*" >> "$LOG"; }
status="ok"

ip=$(tailscale ip -4 2>/dev/null | head -1)
if [ -z "$ip" ]; then
  status="tailscale-down"
else
  want=$(grep -E '^TAILNET_IP=' .env | cut -d= -f2)
  if [ -n "$want" ] && [ "$want" != "$ip" ]; then
    # The node's IP changed — rebind the service to the new one.
    sed -i "s/^TAILNET_IP=.*/TAILNET_IP=$ip/" .env
    docker compose up -d >/dev/null 2>&1
    note "tailnet ip changed $want → $ip; service rebound"
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx cosimo-llm; then
    docker compose up -d >/dev/null 2>&1
    status="llm-container-missing (started)"
  elif ! curl -fsS --max-time 5 "http://$ip:8007/health" >/dev/null 2>&1; then
    # Still loading weights counts as "starting", not broken.
    if docker inspect cosimo-llm --format '{{.State.Health.Status}}' 2>/dev/null | grep -q starting; then
      status="llm-starting"
    else
      status="llm-unhealthy"
    fi
  fi
fi

prev=$(cat "$STATE" 2>/dev/null || echo "")
if [ "$status" != "$prev" ]; then
  note "$status"
  echo "$status" > "$STATE"
fi
