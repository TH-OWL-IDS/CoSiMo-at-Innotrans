# Running & deploying

## Local development

```bash
corepack enable
cp .env.example .env.local        # fill ANTHROPIC_API_KEY etc.
pnpm install
docker compose up -d postgres cms # DB + admin/host console (port 6100)
cd apps/realtime && pnpm start    # agent + socket hub (port 6101)
pnpm --filter @cosimo/console dev   # operator console (port 6102)
pnpm --filter @cosimo/emulator dev  # a browser iPad (port 6103)
pnpm --filter @cosimo/journey dev   # the journey view (port 6104)
```

Ports: **6100** cms, **6101** realtime, **6102** console dev, **6103** emulator dev,
**6104** journey dev, 5432 postgres. The kiosk has no dev server — it is the native app; the
emulator is its browser stand-in.

The console and emulator dev servers proxy `/socket.io` → 6101, so the
browser runs same-origin like production. The native app in the Simulator
reaches the Mac's services via `http://localhost:6101` (enter it once via the
hidden operator screen — 3s hold on the telemetry slit).

Realtime can also run in Docker (`docker compose up -d`), but running it
natively with `pnpm start` gives faster iteration; it loads the root
`.env.local` itself.

Seeding demo content (personas + telemetry scenarios): see
[cms.md](cms.md#seeding).

## Environment layering

- `.env.example` — the documented template (committed).
- `.env.local` — dev secrets (gitignored). Loaded both by native `pnpm`
  runs and injected into containers via compose `env_file`.
- `.env.prod` — VPS values: `COSIMO_DOMAIN`, real `PAYLOAD_SECRET`, API
  keys, `CORS_ORIGINS`.

Secrets (Anthropic/Deepgram/ElevenLabs keys) exist ONLY in env — never in
the CMS, never in compose defaults. Endpoint *routing* (URLs/models) is
CMS-editable at runtime via the operator-config global.

## Production (VPS, behind Cloudflare Tunnel)

The VPS is already fronted by a Cloudflare Tunnel (`cloudflared` runs with
`--network host`, token/dashboard-managed) that maps hostnames to localhost
ports — the same pattern every other app on the box uses. CoSiMo takes **five
hostnames**:

- `cosimo.homannjohannes.de` → CMS (admin + REST API — nothing live)
- `ws-cosimo.homannjohannes.de` → realtime (the WebSocket the kiosks use)
- `console-cosimo.homannjohannes.de` → the operator console ([console.md](console.md))
- `seat-cosimo.homannjohannes.de` → the seat emulator, a browser iPad
  ([emulator.md](emulator.md))
- `journey-cosimo.homannjohannes.de` → the journey view ([journey.md](journey.md))
  — all three static bundles behind nginx

Cloudflare terminates TLS at the edge, so nothing on the box needs certs and
nothing is published to the public internet — cms and realtime bind to
`127.0.0.1` only, where the tunnel reaches them.

```bash
cp .env.example .env.prod   # set COSIMO_DOMAIN, COSIMO_WS_DOMAIN + real secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.prod up -d --build
```

Then add the five public hostnames in the Cloudflare dashboard (Zero Trust →
Networks → Tunnels → your tunnel → Public Hostnames), just like the other
services on the box:

- `cosimo.homannjohannes.de` → `http://localhost:6220`
- `ws-cosimo.homannjohannes.de` → `http://localhost:6221`
- `console-cosimo.homannjohannes.de` → `http://localhost:6222`
- `seat-cosimo.homannjohannes.de` → `http://localhost:6223`
- `journey-cosimo.homannjohannes.de` → `http://localhost:6224`

Make sure the tunnel has **WebSockets enabled** (default on) for the ws- host.

What the prod overlay changes:

- cms / realtime / console / emulator / journey bind to `127.0.0.1:6220`
  … `6224` (free ports on the box). Postgres publishes nothing.
- CORS on realtime = the console + emulator + journey origins +
  `capacitor://localhost` (the native app). The CMS opens no sockets; the
  ws- host is the target, not an origin — neither is listed.
- The static apps take the realtime URL as a **build arg**
  (`VITE_REALTIME_URL`): the URL is inlined at build — same reason
  `NEXT_PUBLIC_SERVER_URL` is a build arg for the CMS.
- **pg-backup** sidecar: nightly `pg_dump` into `./backups`, N-day
  retention. The sessions collection is the research output — copy this
  directory off the box regularly; it's the one non-negotiable.
- **`./logs`** — the realtime service's daily NDJSON debug log
  (`LOG_DIR`, `LOG_KEEP_DAYS`, `LOG_TRANSCRIPTS`; see
  [logging.md](logging.md)). Worth copying off the box after the fair too —
  it is the only record of *why* a turn went the way it did.

## Reaching the GX10 (the brain) — Tailscale, realtime only

The GX10 sits behind the university's eduroam VPN; its vLLM is bound to its
Tailscale IP. The VPS runs other things, so the **host never joins the
tailnet** — only the realtime container does, via the opt-in
`docker-compose.tailnet.yml` overlay: a `tailscale` sidecar owns a network
namespace, `realtime` runs inside it (`network_mode: service:tailscale`),
the published realtime port moves to the sidecar (cloudflared →
`127.0.0.1:6221` is unchanged), and `cms` still resolves because the
sidecar keeps Docker's DNS (`TS_ACCEPT_DNS=false` — so address the GX10 by
IP, not MagicDNS).

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.tailnet.yml --env-file .env.prod up -d --build
docker compose exec realtime wget -qO- http://100.90.216.127:8006/health   # "ok"
```

Tailscale admin, once: a **tagged** auth key (`tag:cosimo`) so the node never
inherits a person's key expiry; disable key expiry on the node; an ACL
allowing `tag:cosimo` → the GX10 on 8006 only. Then Operator Config → LLM:
`openai-compatible`, `http://100.90.216.127:8006/v1`, the served model
name; `LLM_API_KEY` in `.env.prod` = the GX10's vLLM key. The Log tab's
`turn.start` shows the switch on the next turn.

The kiosks, console, emulator and journey never touch the tailnet — they
only talk to the hub.

## Deployment gotchas learned the hard way

- The cms Dockerfile copies workspace packages **explicitly** — adding a
  new `packages/*` dependency requires adding it to the COPY list, or the
  image builds successfully with stale code.
- Payload schema changes need a container rebuild (`--build`), not just a
  restart.
- The Anthropic/Deepgram/ElevenLabs endpoints, and therefore the *agent*,
  need internet; the offline canned mode keeps the kiosks demoable when
  the uplink drops, since kiosk↔VPS is the only required link. At the
  booth, bring a 5G router as backup uplink rather than trusting venue
  Wi-Fi.
