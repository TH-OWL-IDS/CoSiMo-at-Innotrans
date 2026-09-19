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
- Cabin controls have a **scope** (`CABIN_CONTROLS` in @cosimo/shared):
  `cabin` = ONE shared state on the hub (`cabinControls` — the interior
  light: all four seats share the lamp, a change from any seat reaches every
  seat and the hosts), `seat` = this entry's own (reading lamp). What a seat
  receives on `cabin:state` is always the merge of both, so the payload
  shape never changed. `status.light` on the hosts means: LPU-2 address
  known and the last real switch was confirmed.

### Cabin lighting: the cabin decides, a seat actuates

The cabin LAN is air-gapped and will never get an uplink, so a hub on the VPS
cannot reach the light controller. The iPads are the only dual-homed devices
(Wi-Fi → hub, USB-C Ethernet → cabin LAN), which makes them the actuators:

1. **The light is scenes** (shared `light.ts`): three CMS-defined scenes
   (Standard · Gemütlich · Hell) plus "off". A scene has a row for EVERY
   fixture of the rig (on/off, brightness, cold/warm; the signal light with
   RGB + red mode) — the rider / CoSiMo may only set the three interior
   groups (LIGHT_GROUPS: Lichtlinien / Deckenpaneel / Boden), outer light,
   headrests, reading lamps and signals are staff-only but part of the
   scene. The hub holds ONE `CabinLightState` (active scene, or `null` =
   free after a fixture was moved by hand, + every fixture's level — the
   same objects the console's rig actions edit — + the scene list) and
   broadcasts it as `light:state` to every seat and console. `light:set`
   (a scene key / off / next, a `dim` step — "etwas heller / dunkler"
   scales the interior groups WITHIN the current scene by 0.75 per step,
   never switches or turns off; a scene switch resets it — or one group)
   comes from
   the panel button "d", the slit menu (scenes and off only — no
   per-group fine-tuning at the seat; that is the console's and, by
   voice, `set_light`'s), the console, and CoSiMo's `set_light` tool
   (all through `applyLight`). The console's
   `host:scene-save` writes the cabin's current levels into a scene
   (`ConfigSink` → the CMS global; `keepLevels` = rename only). The old
   `interior-light` / `reading-lamp` controls (`applyCabinControl`) remain
   only for the kiosk operator menu / legacy host overrides — there is no
   reading lamp in the cabin.
2. `cabin/lpu2.ts` turns the change into ready-made URLs for the Cuety LPU-2
   (`pbXX/go` on, `pbXX/re` off so the standalone scene resumes,
   `pbXX/in=<0..255>` dim — our controls speak 0–100, the device 0–255, the
   scaling lives here — `pbXX/ju=<cue>` scene, `pbXX/fl=1` flash). This is
   the only file that knows the controller's dialect.
3. The hub **elects an actuator**: the requesting real iPad, else any healthy
   real iPad (ok before slow, then longest-connected), else the requester
   even as an emulator (the desk dev loop keeps its actuation log). It emits
   `cabin:actuate` there; the actuator fires the GETs on its LAN and answers
   `cabin:actuate:result`. The log carries `actuator` when it differs from
   the requester, and the result `requestedBy`.
4. Nobody can fire, or a failure comes back → the state's owner (cabin or
   seat) is marked `degraded` and rebroadcast — last-known intent stays on
   screen, the demo continues.

The URLs are idempotent, so a repeat or a stand-in actuator is harmless. A
session reset (`beginSession`, "Alles zurücksetzen") deliberately does NOT
touch cabin state — a morning reset must not switch the physical lamp.
Controls with no playback mapped stay purely simulated. Address, playback
and scene-cue mapping come from the CMS (`cabin-config`; scene
KEYS are code-defined, the CMS only assigns cue numbers) with
`LPU2_BASE_URL` as the env fallback, so mounting-day IP changes need no
redeploy.

**Hardening rule:** every socket handler must tolerate malformed or stale
clients — log and continue, never throw through. An unhandled rejection in
a handler kills the process.

### Host console support

Hosts (`role: "host"` — [apps/console](console.md))
additionally receive `host:seats` — a live summary
of every kiosk seat (persona, emotion, phase, consent, active flag, last
utterance/reply, cabin state), pushed on every relevant change. Host
actions: per-seat or all-seat persona, per-seat light override, per-seat
session reset (clears the seat back to the default persona, sleeping face),
journey pause/resume + battery override, offline-mode toggle,
stuck-conversation recovery, and `host:inspect` — a deep view of one seat
(`host:inspect:result`, sent only to the asking host socket) carrying the exact
system prompt a turn on that seat would use right now plus its recorded turns.

A seat is **active** from the visitor's first input until reset/disconnect
— the host UI only shows cards for active seats. There is **no consent
screen**: recording consent is `CONSENT_DEFAULT` (env, true) for walk-ups,
overridden by a card rider's stored decision; `consent:set` remains for an
explicit decision.

## The agent loop (`src/agent/agent.ts`)

One `handleUserTurn` runs a manual streaming tool-use loop: stream text
deltas to the seat as they generate (latency masking), execute tool calls,
feed results back, repeat until the model stops calling tools (guard-capped
at six steps). A call the model already made in this reply (same name and
arguments) is not executed again: it gets "already done", and when a whole
step was repeats the next step runs with `tool_choice: none`, so the model
answers in words instead of looping (a 35B once called `show_choices` six
times — nine seconds of nothing). A step that spoke AND called a tool
("Hier sind die Einstellungen." + `open_settings`) is often followed by the
same sentence after the result: the next step is held back and compared,
a repeat is dropped (`llm.step … repeated`, retracted from the history),
anything new is released in one piece. The recorded CoSiMo turn is stamped when
its text was complete and the recorder inserts turns in time order — it is
written after TTS, which can be later than the rider's next typed input.
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

## The journey in the prompt (`journeyLine` / `journeyBlock`)

Every turn injects one live line — position, speed, EVERY upcoming stop with
its ETA (next, the one after, the terminal), direction, delay, fault — as
`## Fahrt jetzt`, with an explicit boundary rule: answer those facts
directly (one generation); anything the line does not carry (passenger
count, doors/dwell, exact seconds, notes, the way back) MUST be fetched with
`get_telemetry`, whose result is now compact and single-language. Gated on
the GX10 (2026-08-28, 16 scenarios × 4): 62/64, one-step where expected
44/44, tool called in every detail case. The gate script is
`/tmp/gate-journey.py` on the GX10 (copy in the session scratchpad).

## Reply language (`detectLang` / `replyLanguageBlock`)

Instructions stay English (measured 2026-08-28 on the 35B: a German
translation of the core prompt scored 57/64 vs 61/64 — worse tool
discipline, consistent with Qwen's own guidance). The rider's language is
handled at the OUTPUT: the hub detects the utterance language (de/en word
lists, profile language as fallback), the turn's `lang` follows it —
journey line, templated confirmations, cards, TTS — and the prompt ends
with an explicit `## Reply language` block ("…in ENGLISH, not their
preferred language — reply in English anyway"). Gate: 31/32 (the rule
alone scored 20/32 — the German journey line pulled replies back to
German).

## Sessions: check-in and auto-checkout

A kiosk seat starts checked out (`active: false`; the circle shows the
check-in). `markActive` flips it once per session — a card scan
(`beginSession … "nfc"`), the guest chip (`session:checkin` from the seat)
or the first input (chat, consent, settings) — and emits `session:checkin`
(`by`: nfc | guest | input), logged as `session.checkin`. The guest chip
also gets a hello: `hub.onGuestCheckin` → `agent.announce` with one of the
short lines in `guestHello` (canned.ts — "Hi!", "Hallo, ich bin CoSiMo." …,
in the profile's language), TTS only, no LLM; a card has `greetingFor`, a
first talk press its answer. The browser seat's dropdown "Standard" entry
(`session:login` with `default`) is the guest chip. The idle sweep
(15 s) checks a seat out after `config.face.checkoutMs` (2 min) of silence
while idle: `beginSession(deviceId, "default", "timeout")` → `session:reset`
+ the default profile, unless the kiosk said `carried: true` in its hello
(staff iPad: also never the light actuator — `pickActuator` skips it, as
requester and as candidate) or performs the showcase.

## Slit cards and the settings menu (`src/agent/cards.ts`, hub `showCard` / `openSettings`)

The slit is CoSiMo's control strip: one fixed grid (context left, actions
right). The only **card** left is `confirm` (✓ ✗) — `show_choices` puts
Ja/Nein chips under a yes/no question the model asks; a tap sends the label
back as the rider's next message. There is deliberately no free-text list
card: open choices (which lamp, which stop) are asked aloud only. Cards
auto-dismiss (20 s), any turn clears them.

Everything the rider adjusts themselves is the **settings menu**
(`open_settings`, optionally on a section): Textgröße · Lautstärke · Stimme
(Tempo · Typ · Stimmung) · Farbe, icons only at the top level, sliders /
chips / swatches on the leaves, one round button on the right (✓ after a
change, ‹ back otherwise, × on the root; holding it 800 ms resets — a leaf
its one setting, the voice menu its three, the root everything — sent as
`settings:patch` with `reset: true`, one "Zurück auf Standard." line). The hub emits `seat:settings`
(section + the voice catalog); from there the menu is client-side. Every
tap arrives as `settings:patch` — no LLM round: the hub validates and
patches the seat's accommodations, persists for card-bound riders, logs
`settings.patch`, records the exchange in the session history, and CoSiMo
confirms with a short templated line spoken in the NEW setting. The menu
closes after 30 s without a tap, on its back button, or on the next spoken
turn. The former per-setting cards (themes/voices/scale) and the step
wizard are gone; `set_presentation` stays for clear spoken requests.
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

**Generation settings** come from the CMS (Operator-Config → LLM →
Generierung) and apply live (15 s TTL, the router rebuilds the provider when
they change): `temperature` 0.1–1.0, `topP` 0.5–1.0, `maxTokens` 128–2048,
`repetitionPenalty` 1.0–1.3 (vLLM extra), `thinking` (Qwen
`chat_template_kwargs.enable_thinking` per request). Defaults = today's
effective values (0.7 / 0.8 / 1024 / 1.0 / off). Ranges are clamped
server-side because temperature 1.0 once produced degenerate one-token
replies in prod. Anthropic gets temperature + max_tokens only. The console's
LLM card shows one row per setting; a change is a `config.loaded` event.


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

## Config: env + the CMS config globals

Two layers, deliberately separate:

- **Env (`src/config.ts`)** — secrets and defaults. API keys live ONLY here.
- **Operator config (`src/agent/operatorConfig.ts`)** — a TTL-cached read of
  the CMS config globals (agent-config · llm-config · speech-config · voices · cabin-config, read together on one TTL): LLM provider/baseURL/model, STT/TTS
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
the route in the admin restarts the journey; the built-in Begatalbahn
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
without dropping it: a kiosk-role target gets `session:reset` (a fresh
session), a host-role target gets `host:reload`. Parked state is dropped;
logged as `host.action reset-device`.

`host:reset-all` (from a console) resets everything without dropping
sockets: `session:reset "*"` gives every seat a fresh session
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
