# apps/realtime — WebSocket hub + agent

A single Node process (Express + Socket.IO) that owns everything *live*:
the connection hub, the agent loop, speech bridges, per-seat state, and
resilience. Port 4000; health endpoint at `/health`.

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
- Cabin controls are per seat (reading lamp etc.). The one `real` control
  drives the hardware light driver (Shelly relay or fake) — physically a
  single relay today, per-seat state regardless.

**Hardening rule:** every socket handler must tolerate malformed or stale
clients — log and continue, never throw through. An unhandled rejection in
a handler kills the process.

### Host console support

Hosts (`role: "host"`) additionally receive `host:seats` — a live summary
of every kiosk seat (persona, emotion, phase, consent, active flag, last
utterance/reply, cabin state), pushed on every relevant change. Host
actions: per-seat or all-seat persona, per-seat light override, per-seat
session reset (clears the seat back to default persona + consent screen),
telemetry forcing, offline-mode toggle, stuck-conversation recovery.

A seat is **active** from the visitor's consent decision (or first input)
until reset/disconnect — the host UI only shows cards for active seats.

## The agent loop (`src/agent/agent.ts`)

One `handleUserTurn` runs a manual streaming tool-use loop: stream text
deltas to the seat as they generate (latency masking), execute tool calls,
feed results back, repeat until the model stops calling tools (guard-capped).
Face choreography: `thinking` while working → `speaking` phase while text
streams → settle on the model's chosen expressive emotion. The moving mouth
is driven client-side by actual audio playback, *not* by text streaming.

Tools (`src/agent/tools.ts`): `get_telemetry`, `set_cabin_control` (scoped
to the calling seat via `deviceId`), `request_stop` (demo-only),
`set_emotion` (expressive emotions only — mechanical ones are pipeline-owned,
see `packages/shared/src/emotion.ts`).

`announce()` pushes a server-initiated utterance to one seat (text + face +
TTS) — used for NFC greetings and unknown-card replies.

## LLM adapters (`src/agent/llm.ts`)

The loop speaks one neutral interface (`startTurn` → `step`/`addToolResults`).
Two implementations:

- **Anthropic** — the SDK with an optional `baseURL` override.
- **OpenAI-compatible** — hand-rolled SSE streaming against any
  `/chat/completions` endpoint (DGX-hosted vLLM/TGI), with tool-call
  fragment reassembly and Anthropic→OpenAI tool-schema conversion.

`LlmRouter` picks the provider per turn from the operator config and
rebuilds clients only when routing actually changed. No usable provider →
the agent serves canned replies.

## Config: env + operator-config

Two layers, deliberately separate:

- **Env (`src/config.ts`)** — secrets and defaults. API keys live ONLY here.
- **Operator config (`src/agent/operatorConfig.ts`)** — a TTL-cached read of
  the CMS `operator-config` global: LLM provider/baseURL/model, STT/TTS
  base URLs, voice. An admin edit takes effect on the next turn, no
  redeploy. Same provider pattern as personas and telemetry: refresh
  best-effort, merge over env defaults, never throw.

STT (Deepgram) and TTS (ElevenLabs) constructors take *endpoint getters*,
so operator-config changes apply per call. Their availability (key present)
is env-determined at boot and advertised to clients via `status:update`
(`serverStt`/`serverTts`) — clients fall back to browser speech APIs where
they exist.

## Personas & NFC accounts (`src/agent/personas.ts`)

Personas shape the system prompt (support style, emotion bias) and the
client presentation (theme, large text, speak-aloud). Built-in defaults keep
the demo alive with no CMS; CMS docs merge over them on a short TTL. Each
persona can list **NFC chip ids** — `byNfcId()` resolves a scanned chip to a
persona, the hub switches *that seat only*, and the agent greets the visitor
by profile. Unknown chips get a friendly refusal. This is the "register your
own CoSiMo account" mechanic.

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
