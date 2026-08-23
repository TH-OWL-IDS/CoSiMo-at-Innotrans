# apps/realtime — WebSocket hub + agent

A single Node process (Express + Socket.IO) that owns everything *live*:
the connection hub, the agent loop, speech bridges, per-seat state, and
resilience. Port 6101; health endpoint at `/health`.

## The hub (`src/hub.ts`)

The hub is the state router. Its central idea is the
**global vs. per-seat split** (see [architecture.md](architecture.md)):

- Global events (`telemetry:update`, `status:update`) broadcast to all.
- Conversation events (`chat:delta`, `tts:audio`, `face:emotion`,
  `pipeline:phase`, `persona:active`, `voice:transcript`) route **only to
  the seat that owns the session**. The hub learns session→device ownership
  from the first event a socket sends for a session and keeps a
  `DeviceEntry` per connected device: persona, emotion, phase, per-seat
  cabin controls, consent, live conversation snippets.
- Cabin controls are per seat (reading lamp etc.). State lives here; the
  *physical* change is performed by the seat (below). The legacy server-side
  `LightDriver` (Shelly relay / fake) still runs for the one `real` control and
  is only usable when this service sits on the cabin network itself.

### Cabin lighting: the seat is the actuator

The cabin LAN is air-gapped and will never get an uplink, so a hub on the VPS
cannot reach the light controller. The iPads are the only dual-homed devices
(Wi-Fi → hub, USB-C Ethernet → cabin LAN), which makes them the actuators:

1. `set_cabin_control` (or a host override) lands in `applyCabinControl` —
   the hub owns the decision and the state, as before.
2. `cabin/lpu2.ts` turns the change into ready-made URLs for the Cuety LPU-2
   (`pbXX/in=100` on, `pbXX/re` off so the standalone scene resumes,
   `pbXX/in=<level>` for a level). This is the only file that knows the
   controller's dialect.
3. The hub emits `cabin:actuate` to the owning seat, which fires the GETs on
   its LAN and answers `cabin:actuate:result`. A failure marks the control
   `degraded` and rebroadcasts — last-known intent stays on screen, the demo
   continues.

The URLs are idempotent, so a repeat is harmless — which is what makes a
future cabin-wide split (all seats firing the same change) safe. Controls with
no playback mapped stay purely simulated. Address + playback mapping come from
the CMS (`operator-config` → Kabine) with `LPU2_BASE_URL` as the env fallback,
so mounting-day IP changes need no redeploy.

**Hardening rule:** every socket handler must tolerate malformed or stale
clients — log and continue, never throw through. An unhandled rejection in
a handler kills the process.

### Host console support

Hosts (`role: "host"` — [apps/console](console.md))
additionally receive `host:seats` — a live summary
of every kiosk seat (persona, emotion, phase, consent, active flag, last
utterance/reply, cabin state), pushed on every relevant change. Host
actions: per-seat or all-seat persona, per-seat light override, per-seat
session reset (clears the seat back to default persona + consent screen),
journey pause/resume + battery override, offline-mode toggle,
stuck-conversation recovery, and `host:inspect` — a deep view of one seat
(`host:inspect:result`, sent only to the asking host socket) carrying the exact
system prompt a turn on that seat would use right now plus its recorded turns.

A seat is **active** from the visitor's consent decision (or first input)
until reset/disconnect — the host UI only shows cards for active seats.

## The agent loop (`src/agent/agent.ts`)

One `handleUserTurn` runs a manual streaming tool-use loop: stream text
deltas to the seat as they generate (latency masking), execute tool calls,
feed results back, repeat until the model stops calling tools (guard-capped).
Face choreography: `thinking` while working → `speaking` phase while text
streams → settle on the model's chosen expressive emotion, which fades
back to neutral after ~10 s (expressive emotions are reactions, not states;
idle seats drift to the sleeping attract face, FACE_*_MS to tune). The moving mouth
is driven client-side by actual audio playback, *not* by text streaming.

Tools (`src/agent/tools.ts`): `get_telemetry`, `set_cabin_control` (scoped
to the calling seat via `deviceId`), `request_stop` (demo-only),
`set_emotion` (expressive emotions only — mechanical ones are pipeline-owned,
see `packages/shared/src/emotion.ts`). Every seat-affecting tool is scoped to
the seat that called it: `ToolContext` carries `deviceId`, `sessionId` and the
turn number, and `set_emotion` passes the latter two on so one rider's happy
face cannot colour the other three cabin faces (it once did) and a barged-in
turn's late emotion is dropped like its late text.

**Conversation memory.** A turn is not a one-shot: the seat's earlier
messages are replayed to the model, so "say that again", "and the next stop?"
or a rider correcting themselves work. The history comes from the session
recorder — one memory of what was said, not a second copy — capped at the last
`HISTORY_MESSAGES` (12, ~6 exchanges) to bound prompt size and latency over a
long booth day. Two cuts keep it honest: a session reset gives the next visitor
a new `sessionId` and therefore an empty history, and a **card tap cuts history
at the switch** — one seat, two different people, so the new rider's prompt
never carries the previous visitor's words. Partial (interrupted) replies stay
in: the rider heard them. Both adapters normalize the replay (drop empties,
merge consecutive same-role messages, start on a user message).

`announce()` pushes a server-initiated utterance to one seat (text + face +
TTS) — used for NFC greetings and unknown-card replies.

**Barge-in (interruptible turns).** Pressing the talk button (or sending new
input / tapping a card) while CoSiMo answers aborts that seat's in-flight
turn: the kiosk silences playback instantly on button-down, `ptt:start` makes
the agent abort the LLM stream mid-generation (`AbortController` per seat,
wired into both adapters), and pending TTS is dropped. Every turn carries a
per-seat monotonic `turn` number on `chat:delta`/`tts:audio`; hub and clients
drop chunks from superseded turns, so racing stragglers can't garble the new
reply (-1 = wildcard, used by host recover). A running *tool call* is never
aborted (the cabin must not end up half-applied) — the loop stops before the
next generation step instead. Interrupted turns record `outcome:
"interrupted"` with the partial transcript.

## LLM adapters (`src/agent/llm.ts`)

The loop speaks one neutral interface (`startTurn` → `step`/`addToolResults`).
Two implementations:

- **Anthropic** — the SDK with an optional `baseURL` override.
- **OpenAI-compatible** — hand-rolled SSE streaming against any
  `/chat/completions` endpoint (DGX-hosted vLLM/TGI), with tool-call
  fragment reassembly and Anthropic→OpenAI tool-schema conversion.

`LlmRouter` picks the provider per turn from the operator config and
rebuilds clients only when routing actually changed. The health monitor
**probes** the primary every 15 s; while it is unreachable the router hands
turns to the **fallback provider** (Operator Config) and `status.llm` /
`service.status` say so. No usable provider → canned replies. See
[tailnet.md](tailnet.md).

## Config: env + operator-config

Two layers, deliberately separate:

- **Env (`src/config.ts`)** — secrets and defaults. API keys live ONLY here.
- **Operator config (`src/agent/operatorConfig.ts`)** — a TTL-cached read of
  the CMS `operator-config` global: LLM provider/baseURL/model, STT/TTS
  base URLs, voice. An admin edit takes effect on the next turn, no
  redeploy. Same provider pattern as personas: refresh best-effort, merge
  over env defaults, never throw.

## Journey simulation (`src/agent/telemetry.ts`)

Telemetry is *simulated*, not authored: a state machine drives the route
from the CMS `route-config` global end-to-end and back (ping-pong, forever)
— cruise with accel/decel ramps between stops, dwell with open doors,
turnaround + battery top-up at the terminals. Speed, location, ETAs, doors,
battery and occupancy are derived from the simulation clock; the hub
broadcasts a snapshot every second (`telemetry:update`, global). Editing
the route in the admin restarts the journey; the built-in Extertalbahn
route keeps it alive with no CMS. Host overrides (pause/resume, battery,
occupancy, **fault injection / clear**) are applied INTO the simulation, so
they persist. Passengers board per stop demand (live CoSiMo seats count as
riders); **faults** (signal hold, door fault, slow order, low battery) come
from the CMS scenario or the host, are visible to CoSiMo and the journey
view, and are logged. **Full description: [journey.md](journey.md).**

STT (Deepgram) and TTS (ElevenLabs) constructors take *endpoint getters*,
so operator-config changes apply per call. Their availability (key present)
is env-determined at boot and advertised to clients via `status:update`
(`serverStt`/`serverTts`) — clients fall back to browser speech APIs where
they exist.

## Profiles, adaptation & NFC accounts (`src/agent/personas.ts`)

A **profile** shapes the system prompt (verbatim *brief* + fenced *memories*)
and the client presentation (*accommodations* — language, theme, text size,
audio, show-text…). CoSiMo changes accommodations and remembers riders by
voice (`set_presentation` / `remember` / `forget` — fine-grained, no preset
bundles), applied via the hub and written back best-effort through
`ProfileSink`. The built-in `default` clean plate keeps the demo alive with no
CMS; CMS docs are authoritative on a short TTL. Each rider profile lists
**NFC chip ids** — `byNfcId()` resolves a scanned chip, the hub switches *that
seat only*, and the agent greets the rider in their own preferred language;
unknown chips get a friendly refusal. **Full model: [personas.md](personas.md).**

## The debug log

Every step of a turn emits a `LogEvent` through `src/log/logger.ts` — ring
buffer, daily NDJSON file, live push to host consoles. Turn number = join
key. **[Full description: logging.md](logging.md).** Anything new a turn can
do must log.

## Resilience

- **Offline canned mode** (`src/agent/canned.ts` + `src/health.ts`): a
  connectivity probe flips the service into scripted, telemetry-grounded
  replies when the network drops (or the host forces demo mode). Canned
  replies can still drive the cabin light.
- **Turn-level fallback:** an LLM error mid-turn degrades to a canned reply
  rather than a dead end.
- **Session recording** (`src/agent/recorder.ts` + `sink.ts`): every turn is
  recorded in memory and upserted best-effort into the CMS `sessions`
  collection, honoring the visitor's consent flag. Fire-and-forget — the
  live path never waits on Payload.
