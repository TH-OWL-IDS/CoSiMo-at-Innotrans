# apps/realtime — WebSocket hub + agent

A single Node process (Express + Socket.IO) that owns everything *live*:
the connection hub, the agent loop, speech bridges, per-seat state, and
resilience. Port 6101; health endpoint at `/health`.

## The hub (`src/hub.ts`)

The hub is the state router. Its central idea is the
**global vs. per-seat split** (see [architecture.md](architecture.md)):

- Global events (`telemetry:update`, `status:update`) broadcast to all.
- Conversation events (`chat:delta`, `tts:chunk`, `face:emotion`,
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
per-seat monotonic `turn` number on `chat:delta`/`tts:chunk`; hub and clients
drop chunks from superseded turns, so racing stragglers can't garble the new
reply (-1 = wildcard, used by host recover). A running *tool call* is never
aborted (the cabin must not end up half-applied) — the loop stops before the
next generation step instead. Interrupted turns record `outcome:
"interrupted"` with the partial transcript.

## Slit cards (`src/agent/cards.ts`, hub `showCard`)

The slit is CoSiMo's control strip: one fixed grid (context left, actions
right), a small kind vocabulary — `confirm` (✓ ✗), `list` (2–4 chips),
`themes` (swatches), `voices` (catalog chips), `scale` (slider for
volume/speechRate, −/+ for textSize). **Model cards** (`confirm`, `list`)
send the tapped label back as the rider's next message. **Local cards**
(`themes`, `voices`, `scale`, every customizer step) are answered by the hub
via `card:answer` — no LLM round: it patches the seat's accommodations,
persists for card-bound riders, logs `card.answer`, records the exchange in
the session history, and CoSiMo still answers audio-visually with a short
templated line spoken in the NEW setting. `start_customizer` runs the wizard
(colour → text size → contrast → voice → tempo) step by step the same way;
the closing line says whether it persists (card-bound) or lasts the ride.
Cards auto-dismiss (20 s, wizard 45 s), any turn clears them (a spoken answer
during the wizard ends it — the model handles that setting instead).
`reply:repeat` (the ↻ affordance, 8 s after each reply) re-speaks the last
reply without an LLM round; the idle hint ("Taste halten und sprechen") is
client-only after 30 s without activity.

## Streaming TTS (`src/speech/speaker.ts`, `sentences.ts`)

Speech streams as the text does. `TurnSpeaker` is fed every LLM delta;
`takeSentences` cuts complete sentences (conservative: min ~20 chars,
de/en abbreviation guard, ordinal dots, German quotes) and each one is
synthesized immediately — ordered, one at a time (~150 ms per sentence on
ElevenLabs Flash) with `previous_text` for prosody continuity — and shipped
as a `tts:chunk` (`seq` per turn) the moment it exists. The final message
is an end marker (`last: true`, no audio). The client queues clips per
turn, plays them back-to-back, keeps `speaking` up across gaps and settles
120 ms after the last clip. Barge-in: the abort signal drops unshipped
clips; the client's turn guard drops in-flight ones; a new turn's chunk
resets the queue. Canned replies and `announce()` use the same path (the
text just arrives all at once). `tts.done` logs `firstChunkMs` (turn start
→ first playable clip) and `chunks`. Kiosk protocol change: the native app
must be rebuilt (old binaries still listen for `tts:audio`).

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

## `host:config` — the routing, for the console

The hub pushes its resolved operator config (`HostConfigBroadcast` in
`packages/shared/src/ws.ts`) to every host console on hello and whenever
it changes: which CMS/env values it is actually routing to — LLM provider,
base URL, model, fallback; STT and TTS base URLs and models; the voice
catalog size; the LPU-2 address and how many cabin controls are mapped;
and whether the CMS copy ever loaded (`source`, `loadedAt`). URLs and
model names only — keys never leave the environment. The provider is
re-read on its TTL every 15 s even without a turn, and the hub only emits
when the serialized config differs.

## Link check — `sys:ping`, `devices:update`, `host:probe`

Every 2 s (and on `host:probe` from a console) the hub pings each
connected socket with an ack timeout of 1.8 s (rounds never overlap) (`socket.timeout().emit
("sys:ping", ack)`; the shared client hook answers at once). The
round-trip classifies the link: **ok** ≤ 250 ms, **slow** above, **stale**
after two consecutive unanswered pings although the socket is open (typically an app
build that predates `sys:ping`, or a frozen tab), **lost** once the socket
disconnects — lost *kiosks* stay in `devices:update` for 30 s so a flapping
iPad is visible on the console (a closed console tab just disappears). `ConnectedDevice` carries `connectedAt`,
`transport` (websocket vs polling), `lastActivityAt`, `active`, `rttMs`,
`probedAt`, `health`. The hub pushes `devices:update` to host-role clients only (kiosks never
read it), only when a device's facts changed, and logs a `device.health`
event on every transition.

`host:reset-device { deviceId }` (from a console) resets one device
without dropping it: a kiosk-role target gets `session:reset` (back to
consent), a host-role target gets `host:reload`. Parked state is dropped;
logged as `host.action reset-device`.

`host:reset-all` (from a console) resets everything without dropping
sockets: `session:reset "*"` sends every seat back to the consent screen
(as "Alle Sitze zurücksetzen" does), and every *other* console receives
`host:reload` and shows a blocking reload panel. Logged as `host.action
reset-all`.

## Parked seats — reconnects keep their state

On a kiosk disconnect the hub parks the entry's persona, emotion, consent,
active flag, session id, last exchange, cabin controls and turn counter
for 10 min. A hello with the same device id within that window restores
them (logged as `seat.connect` with `restored: true`) and re-maps the
session to the device; the recorder and the agent's history are keyed by
session id, so the conversation simply continues. Resets clear the park.

`hello` carries `kind` (`kiosk | emulator | console | journey`) next to
the role; old clients get the plain kind for their role. `MAX_HOST_CONSOLES`
(default 3): on a console hello the hub evicts the oldest *console* sockets
beyond the cap — `host:evicted` then a server-side
disconnect (not auto-reconnected). Logged as `host.action evict`.

## `host:services` — the deployables for the console

`services.ts` probes the five deployables every 15 s from inside the hub:
the CMS (`PAYLOAD_INTERNAL_URL`), the hub itself, and the three static
sites via `SERVICE_URL_CONSOLE|EMULATOR|JOURNEY` (compose sets the
service names; dev defaults to the local 61xx ports; unset inside Docker
= "unknown"). Public hosts come from `COSIMO_*_DOMAIN` / `COSIMO_DOMAIN`.
The hub cannot query Docker, so "container" is the compose service name
(plus its own container hostname). Pushed to host consoles on hello and
whenever a probe result changes.

## Host token and container restarts

`HOST_TOKEN` (the operator password): consoles send its SHA-256 as
`token` on `hello`; a console without the right token is refused
(`host:unauthorized`, then disconnected). Every `host:*` command is gated
by a per-socket packet middleware on `entry.authed` — a journey view
(host-role, no token) receives broadcasts but can't command. Unset =
dev, everything accepted, warned at boot.

`host:restart-service { id }` restarts a deployable's container via
`DOCKER_PROXY_URL` — the `docker-proxy` sidecar in docker-compose.prod.yml
(tecnativa/docker-socket-proxy, `CONTAINERS=1 POST=1 ALLOW_RESTARTS=1`,
nothing else, no published port). The hub finds the container by its
`com.docker.compose.service` label and POSTs `/restart?t=5`; the outcome
comes back as `host:restart-result` and is logged. Without the proxy
(dev) rows are not restartable.
