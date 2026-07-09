# CoSiMo — agent guide

CoSiMo is an emotion-expressive AI companion for inclusive mobility, demoed
in a MonoCab cabin at InnoTrans 2026: four iPad-mini kiosk seats behind
physical panels, each holding its own private conversation with the same
agent. This file is the entry point for AI coding agents; the deep dives
live in [docs/](docs/).

## Read this first

| Doc | What it explains |
|---|---|
| [docs/architecture.md](docs/architecture.md) | The three deployables, the global-vs-per-seat state model, a voice turn end-to-end, design invariants |
| [docs/kiosk.md](docs/kiosk.md) | The native iPad app: panel-cutout UI, calibration, server config, HID input, iOS build |
| [docs/realtime.md](docs/realtime.md) | Hub routing, agent loop, LLM adapters, speech, personas/NFC, resilience |
| [docs/cms.md](docs/cms.md) | Payload collections/globals, seeding, schema-change workflow, host console |
| [docs/face.md](docs/face.md) | The scribble face engine and the shared socket hook (incl. the mouth-sync design) |
| [docs/hardware.md](docs/hardware.md) | ESP32 buttons + NFC over BLE keyboard — the firmware-facing protocol |
| [docs/deployment.md](docs/deployment.md) | Local dev, env layering, VPS + Cloudflare Tunnel production, gotchas |

## Repo shape

pnpm monorepo. Three apps, three shared packages — **treat the apps as
separate systems** that only meet through `packages/shared`:

- `apps/kiosk` — visitor iPad app (Vite + React + Capacitor). Thin client.
- `apps/realtime` — Socket.IO hub + agent loop (Node). The live path.
- `apps/cms` — Payload 3 + Next 15 + Postgres. Authored/persisted state;
  admin at `/`→`/admin`, operator console at `/host`.
- `packages/shared` — THE contract (types only): ws events, emotions,
  telemetry, personas, sessions. Protocol changes start here.
- `packages/face` — the animated face engine. `packages/client` — the
  `useCosimoSocket` hook. Both consumed by kiosk and cms.

## Commands

```bash
pnpm install
pnpm -r --no-bail typecheck            # the verification gate — keep it green
docker compose up -d postgres cms      # DB + cms on :3001
cd apps/realtime && pnpm start         # realtime on :4000 (loads root .env.local)
pnpm --filter @cosimo/kiosk dev        # kiosk in browser on :5173
cd apps/cms && pnpm seed               # idempotent demo content
cd apps/cms && pnpm generate:types     # after Payload schema changes
cd apps/kiosk && pnpm cap:sync         # rebuild native app bundle
```

There is no test suite yet; `pnpm -r typecheck` is the bar every change
must clear. For behavior, exercise the real stack (a scripted socket.io
client against :4000 works well — see the smoke pattern in git history).

## Rules that keep this codebase coherent

1. **Respect the state model.** Journey/telemetry/status = global,
   broadcast. Conversation/persona/emotion/cabin = per seat, routed to the
   owning socket only. Never leak one seat's events to another.
2. **Protocol changes go through `packages/shared` first**, then server
   (hub), then clients. The Socket.IO generics make drift a type error —
   keep it that way.
3. **API keys live in env only.** The CMS holds URLs and model names
   (operator-config), never secrets.
4. **Everything degrades, nothing dies.** New features need a fallback for
   CMS-down and LLM-down (defaults, canned replies). Hub socket handlers
   must catch — a malformed client event must never crash the process.
5. **The kiosk stays dumb.** Input goes up raw; meaning is assigned
   server-side. Don't put content logic, CMS queries, or interpretation
   into the app.
6. **The face is server-driven, playback-synced.** Emotions come over the
   socket; the moving mouth follows actual audio playback. Don't couple the
   mouth to text streaming.
7. **Payload array fields must never be named `id`** (collides with the
   internal row PK). Regenerate types after schema edits; rebuild the cms
   Docker image (and extend its COPY list for new workspace deps).
8. **iPads are portrait, behind panels.** UI belongs inside the circle and
   slit cutouts; screen corners/edges are physically unreachable. Operator
   access = 3s hold on the slit.
9. Comments/docs explain *why*; German for visitor-facing strings
   (default locale `de`, everything bilingual de/en via `Record<Locale,…>`).

## Environment facts

- Ports: cms 3001 (3000 is reserved by an unrelated project — leave it
  alone), realtime 4000, kiosk dev 5173.
- Prod hosts (Cloudflare Tunnel): `cosimo.homannjohannes.de` → CMS,
  `ws-cosimo.homannjohannes.de` → realtime. The kiosk is socket-only, so
  it bakes the ws- host in `serverUrl.ts`.
- iOS builds: `ios/` is committed; `xcode-select` on this machine points at
  CommandLineTools, so prefix Capacitor/xcodebuild with
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- Simulator can't be UI-automated here (no Accessibility permission);
  inject app prefs via `xcrun simctl spawn <sim> defaults write
  johannes.homann.cosimo.kiosk CapacitorStorage.<key> <value>` instead.
