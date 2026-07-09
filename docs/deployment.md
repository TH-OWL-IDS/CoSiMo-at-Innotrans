# Running & deploying

## Local development

```bash
corepack enable
cp .env.example .env.local        # fill ANTHROPIC_API_KEY etc.
pnpm install
docker compose up -d postgres cms # DB + admin/host console (port 3001)
cd apps/realtime && pnpm start    # agent + socket hub (port 4000)
pnpm --filter @cosimo/kiosk dev   # kiosk in the browser (port 5173)
```

Ports: **3001** cms (3000 is reserved for another local project — never
kill it), **4000** realtime, **5173** kiosk dev, 5432 postgres.

The kiosk dev server proxies `/socket.io` → 4000 and `/api` → 3001, so the
browser kiosk runs same-origin like production. The native app in the
Simulator reaches the Mac's services via `http://localhost:4000` (enter it
once via the hidden operator screen — 3s hold on the telemetry slit).

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
ports — the same pattern every other app on the box uses. CoSiMo takes **two
hostnames**:

- `cosimo.homannjohannes.de` → CMS (admin + `/host` console)
- `ws-cosimo.homannjohannes.de` → realtime (the WebSocket the kiosks use)

Cloudflare terminates TLS at the edge, so nothing on the box needs certs and
nothing is published to the public internet — cms and realtime bind to
`127.0.0.1` only, where the tunnel reaches them.

```bash
cp .env.example .env.prod   # set COSIMO_DOMAIN, COSIMO_WS_DOMAIN + real secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.prod up -d --build
```

Then add the two public hostnames in the Cloudflare dashboard (Zero Trust →
Networks → Tunnels → your tunnel → Public Hostnames), just like the other
services on the box:

- `cosimo.homannjohannes.de` → `http://localhost:3050`
- `ws-cosimo.homannjohannes.de` → `http://localhost:4050`

Make sure the tunnel has **WebSockets enabled** (default on) for the ws- host.

What the prod overlay changes:

- cms + realtime bind to `127.0.0.1:3050` / `127.0.0.1:4050` (free ports on
  the box — 3001/4000 are taken by other apps). Postgres publishes nothing.
- CORS on realtime = `https://cosimo.homannjohannes.de` (the `/host` page
  origin) + `capacitor://localhost` (the native app). The ws- host is the
  target, not an origin, so it is not listed.
- **`NEXT_PUBLIC_*` are passed as build args** so the `/host` console's
  browser code is compiled with the right realtime URL — they can't be set
  at runtime (Next inlines them at build). The overlay wires this up.
- **pg-backup** sidecar: nightly `pg_dump` into `./backups`, N-day
  retention. The sessions collection is the research output — copy this
  directory off the box regularly; it's the one non-negotiable.

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
