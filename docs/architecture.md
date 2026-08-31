# Architecture

CoSiMo is an emotion-expressive AI companion demoed inside a MonoCab cabin at
InnoTrans: four iPad-mini kiosks (one per seat), each behind a physical panel,
each hosting its own private conversation with the same agent brain.

## The three deployables

```
iPad (×4)                      VPS / dev machine                cloud
┌─────────────┐   wss    ┌──────────────────────────┐   https ┌─────────────┐
│ apps/kiosk   │◄────────►│ apps/realtime            │◄───────►│ Claude API   │
│ native app   │          │ Socket.IO hub + agent    │         │ or DGX/vLLM  │
└─────────────┘          │ loop, STT/TTS bridges    │◄───────►│ Deepgram     │
                          └────────────┬─────────────┘◄───────►│ ElevenLabs   │
┌─────────────┐   https               │ REST                  └─────────────┘
│ browser      │◄──────────┬───────────▼─────────────┐
│ /admin       │           │ apps/cms                 │
└─────────────┘           │ Payload CMS + Postgres   │
                          └──────────────────────────┘
```

- **[apps/kiosk](kiosk.md)** — the visitor-facing native iPad app. A thin
  client: it streams input up and renders output down. It holds no logic
  about what CoSiMo knows or says.
- **[apps/realtime](realtime.md)** — the brain's plumbing. Owns the live
  path: WebSocket hub, agent loop (LLM tool-use), speech in/out, per-seat
  state, resilience. If it's about a *conversation happening right now*, it
  lives here.
- **[apps/cms](cms.md)** — Payload CMS on Postgres: a UI for the database.
  Owns everything *authored or persisted*: rider profiles, the simulation
  route, endpoint routing, and the recorded sessions (the research dataset).
  Never in the live path — the realtime service reads it on short TTLs and falls back to
  built-in defaults when it's unreachable.

Three more apps are static, socket-only clients of the hub that never touch
the CMS: **[apps/console](console.md)**, the live operator console booth staff
use during the show; **[apps/emulator](emulator.md)**, a browser iPad (the
same seat UI with the hardware replaced by a side panel) for development; and
**[apps/journey](journey.md)**, the line as a live diagram for a booth screen.

Shared packages keep the sides honest:

- **`packages/shared`** — the contract: emotion vocabulary, WebSocket event
  types, telemetry/persona/session shapes. Realtime and all clients import
  the same types, so protocol drift is a compile error.
- **`packages/face` + `packages/client`** — the [face engine](face.md) and
  the `useCosimoSocket` hook, shared by the kiosk and the host console.
- **`packages/seat-ui`** — the seat as the rider sees it (`useSeat`,
  `SeatView`), rendered identically by the iPad app and the emulator.

## Global vs. per-seat — the core state model

This distinction runs through everything:

**Global (one MonoCab, shared by all seats):** the journey — telemetry
(speed, destination, next stops, battery, doors), service health status,
demo/offline mode. Broadcast to every client.

**Per seat (one iPad = one kiosk = one session):** the conversation —
session, persona ("account"), face emotion, pipeline phase, streamed reply,
TTS audio, and the cabin controls (cabin-scoped ones — the shared interior
light — live once on the hub; the reading lamp is seat-local). The hub
routes these events only to the socket that owns the session. Seats never see
or hear each other's conversations.

The host console reflects this split: a "Fahrt (global)" section and one card
per *active* seat (see [realtime.md](realtime.md#host-console-support)).

## Data flow of one voice turn

1. Visitor holds the talk surface → iPad streams mic audio over the socket.
2. Realtime pipes it to Deepgram (STT) → text.
3. Agent loop calls the LLM (Claude, or an OpenAI-compatible endpoint) with
   the seat's persona in the system prompt and tools like `get_telemetry`
   and `set_cabin_control`.
4. Tool calls resolve against CMS-backed providers (telemetry) or the hub
   (cabin, scoped to the calling seat).
5. Reply text streams to the seat as it is generated (latency masking);
   ElevenLabs synthesizes speech; audio + emotion events go to the seat.
6. The face's moving mouth is driven by *actual audio playback* on the
   client, not by text streaming — so lips and voice stay in sync.
7. The turn (transcript, tools, emotion, latency, consent) is appended to
   the `sessions` collection — the research output.

## Design invariants worth defending

- **The model never touches the database.** It asks for tools; the realtime
  service executes them. API keys never leave the server environment.
- **The kiosk never interprets content.** NFC chip IDs, button presses,
  audio — all reported raw to the server, which owns the meaning. It does
  *act* on the cabin LAN (it is the only device on it), but only by firing
  URLs the server built — execution, not interpretation.
- **Everything degrades gracefully.** CMS down → built-in profile/route
  defaults (the journey simulation keeps driving). LLM/network down →
  scripted canned replies grounded in telemetry. Light hardware down → the
  seat reports the failure, state is marked degraded, demo continues.
- **A misbehaving client must never crash the hub.** Socket handlers catch;
  a stale browser tab once took the whole service down before this rule.
