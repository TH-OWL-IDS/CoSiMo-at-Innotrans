# CoSiMo — InnoTrans 2026 Showcase

CoSiMo is an **agentic AI for inclusive mobility**, demoed inside a MonoCab on four iPad
kiosk clients. This monorepo holds the full showcase: a conversational, emotion-expressive
agent that can control cabin functions, answer from mocked MonoCab telemetry, adapt to
different visitor personas, and record every interaction as a research dataset.

## Architecture

```
packages/shared   shared TypeScript types (emotions, telemetry, tools, ws events, turns)
apps/cms          Payload CMS + Next.js  — admin (research dashboard + content + operator
                  config) and the iPad PWA + host console frontend
apps/realtime     Node + Socket.IO       — Claude agent loop, STT/TTS, Shelly light driver,
                  WebSocket hub syncing the 4 iPads, offline canned mode
```

The **live path** (WebSocket, voice, streaming, emotion) lives in `apps/realtime`.
**Payload** owns config, content, and persisted data — never the live engine.
Both share one Postgres database (Payload owns the schema).

## Collections

- **personas** — hand-authored visitor support styles + emotional bias + UI theme.
- **mockup-data** — hand-authored MonoCab telemetry pool (CoSiMo's answer source).
- **sessions** — runtime-generated conversation logs (read-only in admin); the research output.

## Quick start

```bash
corepack enable          # provides pnpm
cp .env.example .env      # fill in ANTHROPIC_API_KEY etc.
pnpm install
pnpm up                   # docker compose: postgres + cms + realtime
```

- CMS + iPad PWA:  http://localhost:3000
- Realtime health: http://localhost:4000/health

## Status

Phase 0 — monorepo, Docker, and service skeletons. See the plan for later phases
(agent core, Face engine, cabin control, voice, personas, data capture, host console,
resilience, hardening).

> Out of scope: real MonoCab telemetry integration; CoSiMo driving the vehicle.
