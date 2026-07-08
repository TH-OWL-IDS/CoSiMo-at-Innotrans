# CoSiMo — InnoTrans 2026 Showcase

CoSiMo is an **agentic AI for inclusive mobility**, demoed inside a MonoCab on four iPad
kiosk clients. This monorepo holds the full showcase: a conversational, emotion-expressive
agent that can control cabin functions, answer from mocked MonoCab telemetry, adapt to
different visitor personas, and record every interaction as a research dataset.

Full documentation lives in [docs/](docs/) — start with
[docs/architecture.md](docs/architecture.md). AI agents: see [AGENTS.md](AGENTS.md).

## Architecture

```
packages/shared   shared TypeScript types (emotions, telemetry, tools, ws events, turns)
packages/face     the animated scribble Face engine (poses, ambient idle rig, schemes)
packages/client   the useCosimoSocket hook — live client state over Socket.IO
apps/kiosk        Vite + React + Capacitor — the native iPad app (the visitor-facing agent)
apps/cms          Payload CMS + Next.js  — admin (research data + content + operator
                  config) and the /host operator console
apps/realtime     Node + Socket.IO       — agent loop (Claude or an OpenAI-compatible
                  endpoint), STT/TTS, Shelly light driver, WebSocket hub syncing the
                  4 iPads, offline canned mode
```

The **live path** (WebSocket, voice, streaming, emotion) lives in `apps/realtime`.
**Payload** owns config, content, and persisted data — never the live engine.
Both share one Postgres database (Payload owns the schema). The iPads run the
`apps/kiosk` native app, a thin client that talks only to the realtime service.

## Collections & globals

- **personas** — hand-authored visitor support styles + emotional bias + UI theme.
- **mockup-data** — hand-authored MonoCab telemetry pool (CoSiMo's answer source).
- **sessions** — runtime-generated conversation logs (read-only in admin); the research output.
- **operator-config** (global) — LLM/STT/TTS endpoint routing (provider, base URL, model),
  editable live in the admin; picked up by the realtime service within ~15 s. API keys
  stay in the server env, never in the CMS.

## Quick start (dev)

```bash
corepack enable           # provides pnpm
cp .env.example .env.local # fill in ANTHROPIC_API_KEY etc.
pnpm install
pnpm up                   # docker compose: postgres + cms + realtime
pnpm --filter @cosimo/kiosk dev   # kiosk on http://localhost:5173 (proxies to cms/realtime)
```

- Kiosk (dev, browser): http://localhost:5173
- CMS admin + /host:     http://localhost:3001
- Realtime health:       http://localhost:4000/health

## iPad build (native app)

Requires Xcode and an Apple Developer account (paid = builds last a year; free = 7 days).

```bash
cd apps/kiosk
pnpm cap:sync    # build web bundle + sync into ios/
pnpm ios:open    # open in Xcode → select the iPad → Run
```

On first launch the app asks for the server URL (e.g. `https://cosimo.example.org`);
it is persisted on the device. Operators can change it later via an invisible
**3-second long-press in the bottom-left corner**. Once the production domain is
fixed, bake it into `apps/kiosk/src/config/serverUrl.ts` (`DEFAULT_SERVER_URL`) so
fresh installs auto-connect.

## VPS deployment (prod)

One domain, automatic TLS (Caddy → Let's Encrypt), `wss://` for the kiosk sockets,
nightly `pg_dump` into `./backups`:

```bash
cp .env.example .env.prod  # set COSIMO_DOMAIN, real secrets/keys
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Caddy routes `/socket.io/*` + `/health` → realtime, everything else (admin, `/host`,
`/api`) → cms. Only ports 80/443 are exposed.

## Status

Kiosk split out as a native Capacitor app; Face engine ported from the mockup
(ambient idle rig, head-turn, procedural speech mouth) into `packages/face`;
operator-config endpoint routing in place. Next: on-device mic smoke test
(WKWebView → wss), personas seeding, host console polish, hardening.

> Out of scope: real MonoCab telemetry integration; CoSiMo driving the vehicle.
