# Running & deploying

## Local development

```bash
corepack enable
cp .env.example .env.local        # fill ANTHROPIC_API_KEY etc.
pnpm install
docker compose up -d postgres cms # DB + admin/host console (port 3001)
cd apps/realtime && pnpm start    # agent + socket hub (port 4000)
pnpm --filter @cosimo/console dev   # operator console (port 5174)
pnpm --filter @cosimo/emulator dev  # a browser iPad (port 5175)
```

Ports: **3001** cms (3000 is reserved for another local project — never
kill it), **4000** realtime, **5174** console dev, **5175** emulator dev,
5432 postgres. The kiosk has no dev server — it is the native app; the
emulator is its browser stand-in.

The console and emulator dev servers proxy `/socket.io` → 4000, so the
browser runs same-origin like production. The native app in the Simulator
reaches the Mac's services via `http://localhost:4000` (enter it once via the
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
ports — the same pattern every other app on the box uses. CoSiMo takes **four
hostnames**:

- `cosimo.homannjohannes.de` → CMS (admin + REST API — nothing live)
- `ws-cosimo.homannjohannes.de` → realtime (the WebSocket the kiosks use)
- `console-cosimo.homannjohannes.de` → the operator console ([console.md](console.md))
- `seat-cosimo.homannjohannes.de` → the seat emulator, a browser iPad
  ([emulator.md](emulator.md))
  — both static bundles behind nginx

Cloudflare terminates TLS at the edge, so nothing on the box needs certs and
nothing is published to the public internet — cms and realtime bind to
`127.0.0.1` only, where the tunnel reaches them.

```bash
cp .env.example .env.prod   # set COSIMO_DOMAIN, COSIMO_WS_DOMAIN + real secrets
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.prod up -d --build
```

Then add the four public hostnames in the Cloudflare dashboard (Zero Trust →
Networks → Tunnels → your tunnel → Public Hostnames), just like the other
services on the box:

- `cosimo.homannjohannes.de` → `http://localhost:6220`
- `ws-cosimo.homannjohannes.de` → `http://localhost:6221`
- `console-cosimo.homannjohannes.de` → `http://localhost:6222`
- `seat-cosimo.homannjohannes.de` → `http://localhost:6223`

Make sure the tunnel has **WebSockets enabled** (default on) for the ws- host.

What the prod overlay changes:

- cms / realtime / host / emulator bind to `127.0.0.1:6220` / `6221` /
  `6222` / `6223` (free ports on the box — 3001/4000 are taken by other
  apps). Postgres publishes nothing.
- CORS on realtime = the host console + the emulator origins +
  `capacitor://localhost` (the native app). The CMS opens no sockets; the
  ws- host is the target, not an origin — neither is listed.
- The two static apps take the realtime URL as a **build arg**
  (`VITE_REALTIME_URL`): the URL is inlined at build — same reason
  `NEXT_PUBLIC_SERVER_URL` is a build arg for the CMS.
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
