# The tailnet — how the hub reaches the brain

CoSiMo's brain is a dedicated vLLM on the **GX10** (`infra/gx10/`), a machine
behind the university's eduroam VPN. It is reachable over **Tailscale** only —
WireGuard, end-to-end encrypted, so visitor transcripts never pass through a
third party in the clear (the reason Tailscale beat a Cloudflare Tunnel).

```
iPad ──wss──▶ Cloudflare ──▶ VPS: [ tailscale sidecar ns ]══ tailnet ══▶ GX10 :8007  cosimo-llm
                                   └─ realtime (same ns)                    (vLLM, stock Qwen3 27B NVFP4)
(dev Mac, only if the LOCAL realtime should use the GX10) ── tailnet ══▶ GX10 :8007
```

**Who is on the tailnet:** the GX10 and the realtime *container* on the VPS
(not the host — it runs other things). A developer's Mac joins only to run
a *local* hub against the GX10; testing through the VPS needs nothing on the
Mac. **Who is never on it:** the kiosks, console, emulator, journey — they
only talk to the hub. The CMS never talks to the brain at all.

## The GX10 side (`infra/gx10/`)

- `cosimo-llm`: its own compose stack in `~/cosimo-ai`, separate from every
  other tenant's container. Stock `unsloth/Qwen3.8-27B-NVFP4`, served as
  `cosimo-qwen3-27b`, tool calling on, thinking off, 32k window, 4 seats,
  ~24 % of unified memory. Bound to the **tailnet IP only**, port 8007,
  bearer-protected (`VLLM_API_KEY` in `~/cosimo-ai/.env`).
- **Auto-connect:** `tailscaled` is an enabled system service with
  `WantRunning` — the node rejoins on boot; the container is
  `restart: unless-stopped`.
- **Watchdog:** `cosimo-tailnet-check.sh` from the user's crontab every
  minute (no sudo on the box): tailnet IP present → container running →
  bound to the *current* IP (rebinds if the node was ever re-registered) →
  `/health` answering. State changes go to `~/cosimo-ai/check.log`.
- **Identity:** the node must be **tagged** `tag:cosimo-gx10` (no key
  expiry). Tagging needs sudo, once: `sudo tailscale up
  --advertise-tags=tag:cosimo-gx10` (keeps the node and its IP).

## The VPS side (`docker-compose.tailnet.yml`)

Opt-in overlay: a `tailscale` sidecar owns a network namespace, `realtime`
runs inside it (`network_mode: service:tailscale`), realtime's published
port moves to the sidecar (cloudflared → `127.0.0.1:6221` unchanged), and
Docker DNS is kept (`TS_ACCEPT_DNS=false`) so `cms` still resolves — address
the GX10 by IP. Joins with a **tagged auth key** (`tag:cosimo-vps`, single
use, non-ephemeral) from `.env.prod`; state persists in a volume, so it
reconnects on restart without a new key.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.tailnet.yml --env-file .env.prod up -d --build
docker compose exec realtime wget -qO- http://100.90.216.127:8007/health   # "ok"
```

## Policy (`infra/tailscale/policy.hujson`)

The ACL is checked in; paste it into the admin console. `tag:cosimo-vps →
tag:cosimo-gx10:8007`, admins → `8007, 22`, nothing else. Keep both in sync.

## The hub knows whether the brain is there

`health.ts` probes the primary LLM every 15 s (`GET /v1/models` with the
bearer). `status.llm` in the console now means **reachable**, not merely
configured; a change logs `service.status` (`llmPrimary`, `llmFallbackActive`).

**Fallback provider** (Operator Config → LLM): while the primary is
unreachable, turns run on the fallback (e.g. Anthropic) automatically and
`turn.start` shows `… (fallback)`; with no fallback configured the hub goes
canned. The primary is retried every probe and takes over again by itself.

## Runbook — "CoSiMo is canned / the LLM dot is red"

1. Console → Log: the last `service.status` says whether the *network* or the
   *brain* went away, and whether the fallback is active.
2. On the VPS: `docker compose exec realtime wget -qO- http://<gx10-ip>:8007/health`.
   Nothing → `docker compose logs tailscale` (auth key expired? node removed
   in the admin console?). `ok` → the hub's probe will flip back within 15 s.
3. On the GX10: `tail ~/cosimo-ai/check.log`; `docker logs cosimo-llm`.
4. Tailnet admin: both nodes tagged, key expiry disabled, the ACL unchanged.

## Measured (2026-08-23, stock Qwen3 27B NVFP4 on the GX10)

Tool-call turn ("Mach bitte das Licht an" → `set_cabin_control`): 3.8–4.0 s;
four seats at once: all four in 4.4 s (batched); streaming first byte 70 ms.
The other tenant's container does the same in 2.8 s thanks to MTP speculative
decoding — worth trying `--speculative-config {"method":"mtp",…}` if the
checkpoint carries MTP weights.

## Known limits

- The tailnet is a **personal GitHub-login tailnet** (`hawx07.github`). If
  that account is locked, every node goes with it. An org tailnet — or
  Headscale on the VPS, same client, same overlay — is the fix when the
  project outlives its founder.
- The chain internet → VPS → tailnet → eduroam → GX10 is for development. At
  the fair, the GX10 travels to the booth, or the fallback provider carries
  the show.
