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
| [docs/personas.md](docs/personas.md) | Rider profiles: accommodations vs. brief vs. memories, the clean-plate default, the adapt/remember tools, GDPR stance |
| [docs/cms.md](docs/cms.md) | Payload collections/globals, seeding, schema-change workflow, host console |
| [docs/face.md](docs/face.md) | The scribble face engine and the shared socket hook (incl. the mouth-sync design) |
| [docs/console.md](docs/console.md) | The live operator console (`apps/console`) — what booth staff use during the show |
| [docs/emulator.md](docs/emulator.md) | The browser iPad (`apps/emulator`) and `packages/seat-ui`, the seat UI shared with the kiosk |
| [docs/hardware.md](docs/hardware.md) | ESP32 buttons + NFC over BLE keyboard — the firmware-facing protocol |
| [docs/deployment.md](docs/deployment.md) | Local dev, env layering, VPS + Cloudflare Tunnel production, gotchas |

## Repo shape

pnpm monorepo. Five apps, four shared packages — **treat the apps as
separate systems** that only meet through `packages/shared`:

- `apps/kiosk` — visitor iPad app (Vite + React + Capacitor). Thin client;
  holds only what the iPad has (HID input, cabin-LAN actuator, calibration).
- `apps/console` — the live operator console (static, `console-cosimo.…`). What
  booth staff have open during the show; socket-only.
- `apps/emulator` — a browser iPad (static, `seat-cosimo.…`): the same seat
  UI, hardware replaced by a side panel. A developer tool — kept separate
  from the host console on purpose.
- `apps/realtime` — Socket.IO hub + agent loop (Node). The live path.
- `apps/cms` — Payload 3 + Next 15 + Postgres. **A UI for the database and
  nothing else**: admin at `/`→`/admin` plus the REST API. No live surface
  lives here — it plays no role during the show.
- `packages/shared` — THE contract (types only): ws events, emotions,
  telemetry, personas, sessions. Protocol changes start here.
- `packages/face` — the animated face engine. `packages/client` — the
  `useCosimoSocket` hook. `packages/seat-ui` — the seat as the rider sees
  it (`useSeat` + `SeatView`), rendered identically by kiosk and emulator.
  **Rider-facing UI changes go in seat-ui, never in one app alone.**

## Commands

```bash
pnpm install
pnpm -r --no-bail typecheck            # the verification gate — keep it green
docker compose up -d postgres cms      # DB + cms on :3001
cd apps/realtime && pnpm start         # realtime on :4000 (loads root .env.local)
pnpm --filter @cosimo/console dev         # operator console on :5174
pnpm --filter @cosimo/emulator dev     # seat emulator on :5175
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
   into the app. The one thing it *does* is act on the air-gapped cabin LAN
   (it is the only device on it) — and only by firing URLs the hub built.
6. **The face is server-driven, playback-synced.** Emotions come over the
   socket; the moving mouth follows actual audio playback. Don't couple the
   mouth to text streaming.
7. **Payload array fields must never be named `id`** (collides with the
   internal row PK). Regenerate types after schema edits; rebuild the cms
   Docker image (and extend its COPY list for new workspace deps).
8. **iPads are portrait, behind panels.** UI belongs inside the circle and
   slit cutouts; screen corners/edges are physically unreachable. Operator
   access = 3s hold on the slit.
9. **Profiles are data; prose carries the nuance.** A structured profile
   field exists only if deterministic code acts on it (accommodations);
   everything else lives in the operator brief / CoSiMo's memories. Never
   machine-write the brief; persist accommodations, never diagnoses
   (GDPR). See [docs/personas.md](docs/personas.md).
10. **Turns are interruptible.** `chat:delta`/`tts:audio` carry a per-seat
    turn number; new input aborts the seat's in-flight turn. Anything that
    streams to a seat must ride a turn number so stale chunks can be
    dropped — and a running tool call is never aborted mid-flight.
11. Comments/docs explain *why*; German for visitor-facing strings.
    **Shared, non-personal content is bilingual de/en** via
    `Record<Locale,…>` (telemetry, cabin labels, consent); **personal
    profiles have *a* preferred language** instead (accommodations).

## Environment facts

- Ports: cms 3001 (3000 is reserved by an unrelated project — leave it
  alone), realtime 4000, console dev 5174, emulator dev 5175. The kiosk
  has no browser dev server — it is the native app; use the emulator.
- Prod hosts (Cloudflare Tunnel): `cosimo.homannjohannes.de` → CMS,
  `ws-cosimo.homannjohannes.de` → realtime, `console-cosimo.…` → host console,
  `seat-cosimo.…` → emulator. The kiosk is socket-only, so it bakes the ws-
  host in `serverUrl.ts`; the two static apps bake it at build
  (`VITE_REALTIME_URL`).
- iOS builds: `ios/` is committed; `xcode-select` on this machine points at
  CommandLineTools, so prefix Capacitor/xcodebuild with
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- Simulator can't be UI-automated here (no Accessibility permission);
  inject app prefs via `xcrun simctl spawn <sim> defaults write
  johannes.homann.cosimo.kiosk CapacitorStorage.<key> <value>` instead.
