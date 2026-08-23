# The tailnet — how the hub reaches the brain

CoSiMo's brain is a dedicated vLLM on the **GX10** (`infra/gx10/`), a shared
machine behind the university's eduroam VPN. It is reachable over
**Tailscale** only — WireGuard, end-to-end encrypted, so visitor transcripts
never pass through a third party in the clear (the reason Tailscale beat a
Cloudflare Tunnel).

**CoSiMo has its own tailnet.** The GX10's host Tailscale belongs to another
user's tailnet and is not ours to configure; the VPS host runs other things.
So on *both* machines the membership is a **sidecar container** owning a
network namespace, and CoSiMo's process runs inside it. The hosts stay out.

```
iPad ──wss──▶ Cloudflare ──▶ VPS: [ tailscale sidecar ns ] ══ CoSiMo tailnet ══ GX10: [ tailscale sidecar ns ]
                                   └─ realtime                                        └─ cosimo-llm :8007
```

**Who is on the tailnet:** the two sidecars — tagged `tag:cosimo-vps` and
`tag:cosimo-gx10`, no key expiry — and the developer's own devices if they
run a *local* hub against the GX10 (testing through the VPS needs nothing on
the Mac). **Who is never on it:** the kiosks, console, emulator, journey —
they only talk to the hub. The CMS never talks to the brain at all.

## The GX10 side (`infra/gx10/`)

- `cosimo-llm`: its own compose stack in `~/cosimo-ai`, separate from every
  other tenant's container. Stock `unsloth/Qwen3.8-27B-NVFP4`, served as
  `cosimo-qwen3-27b`, tool calling on, thinking off, 32k window, 4 seats,
  ~24 % of unified memory, bearer-protected (`VLLM_API_KEY` in
  `~/cosimo-ai/.env`).
- **Its own tailnet membership:** the `cosimo-tailscale` sidecar joins
  CoSiMo's tailnet with a tagged key (`TS_AUTHKEY` in `.env`); `cosimo-llm`
  runs in its namespace (`network_mode: service:tailscale`) listening on
  8007. Reachable at the sidecar's tailnet IP and **nowhere else** — no host
  port, nothing on the university LAN. No sudo needed: the docker group
  grants `/dev/net/tun` + `NET_ADMIN`.
- **Auto-connect:** both containers `restart: unless-stopped`; the sidecar's
  node state lives in a volume, so it rejoins after a reboot without a key.
- **Watchdog:** `cosimo-tailnet-check.sh` from the user's crontab every
  minute: sidecar running with a tailnet IP → model container running →
  `/health` answering on that IP (what the VPS sees). Missing containers are
  restarted; a sidecar without an IP (auth key problem) is reported. State
  changes go to `~/cosimo-ai/check.log`; the IP to `~/cosimo-ai/.tailnet-ip`.

## The VPS side (`docker-compose.tailnet.yml`)

Same pattern: a `tailscale` sidecar owns a network namespace, `realtime`
runs inside it (`network_mode: service:tailscale`), realtime's published
port moves to the sidecar (cloudflared → `127.0.0.1:6221` unchanged), and
Docker DNS is kept (`TS_ACCEPT_DNS=false`) so `cms` still resolves — address
the GX10 sidecar by its tailnet IP (`GX10_TAILNET_IP`). Joins with a **tagged
auth key** (`tag:cosimo-vps`, single use, non-ephemeral) from `.env.prod`;
state persists in a volume, so it reconnects on restart without a new key.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.tailnet.yml --env-file .env.prod up -d --build
docker compose exec realtime wget -qO- http://<gx10 sidecar ip>:8007/health   # "ok"
```

## Setting up CoSiMo's tailnet (once, in the admin console)

1. Create the tailnet with your own login at `login.tailscale.com` (the free
   personal plan is enough: 100 devices).
2. **Access controls** → paste `infra/tailscale/policy.hujson` → save. It is
   the source of truth; keep the two in sync. `tag:cosimo-vps →
   tag:cosimo-gx10:8007`, your devices → `8007`, nothing else.
3. **Settings → Keys** → two auth keys, each *single-use, not ephemeral*:
   one tagged `tag:cosimo-gx10` (→ `~/cosimo-ai/.env` on the GX10), one
   tagged `tag:cosimo-vps` (→ `.env.prod` on the VPS). Tagged nodes never
   expire.
4. After both sidecars joined: **Machines** shows `cosimo-gx10` and
   `cosimo-vps`; note the GX10 sidecar's IP for `GX10_TAILNET_IP` and
   Operator Config.

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
3. On the GX10: `tail ~/cosimo-ai/check.log`; `docker logs cosimo-tailscale`
   (no tailnet IP = the auth key was rejected/expired → a new single-use key
   in `.env`, `docker compose up -d`); `docker logs cosimo-llm`.
4. Tailnet admin: both machines present and tagged, the ACL unchanged.

## Measured (2026-08-23, stock Qwen3 27B NVFP4 on the GX10)

Tool-call turn ("Mach bitte das Licht an" → `set_cabin_control`): 3.8–4.0 s;
four seats at once: all four in 4.4 s (batched); streaming first byte 70 ms.
The other tenant's container does the same in 2.8 s thanks to MTP speculative
decoding — worth trying `--speculative-config {"method":"mtp",…}` if the
checkpoint carries MTP weights.

## Known limits

- CoSiMo's tailnet is a **personal-login tailnet** owned by one person. If
  that account is locked, both sidecars go with it. An org tailnet — or
  Headscale on the VPS, same client, same overlay — is the fix when the
  project outlives its founder. (The GX10's *host* Tailscale belongs to a
  different user's tailnet and is deliberately not used.)
- The chain internet → VPS → tailnet → eduroam → GX10 is for development. At
  the fair, the GX10 travels to the booth, or the fallback provider carries
  the show.
