/**
 * WebSocket contract between the realtime service (hub) and the iPad PWA
 * clients + host console. The realtime service is the single source of truth;
 * all four iPads stay in sync by subscribing to these server→client events.
 *
 * Typed for Socket.IO's generics:
 *   io.on("connection") uses Socket<ClientToServerEvents, ServerToClientEvents>
 */

import type { FaceEmotion } from "./emotion.js";
import type { MonoCabTelemetry, HostTelemetryPatch, Locale } from "./telemetry.js";
import type {
  CabinActuation,
  CabinActuationResult,
  CabinControlState,
  CabinControlId,
} from "./cabin.js";
import type { Accommodations, PersonaBroadcast, PersonaKey } from "./persona.js";
import type { Modality, Turn, SeatCard } from "./session.js";
import type { LogEvent } from "./log.js";

/** A device connected to the realtime hub (for the operator console). */
/** Link health of one connected device, from the hub's periodic ping. */
export type DeviceHealth =
  | "ok"     // answered the last ping within 250 ms
  | "slow"   // answered, but slower than 250 ms
  | "stale"  // socket open, no answer within the timeout (old app? frozen tab?)
  | "lost";  // socket gone — kept in the list for 30 s so a flap is visible

/** What a client is, beyond its role: real iPad vs browser emulator (both
 *  kiosk-role), operator console vs journey view (both host-role). */
export type ClientKind = "kiosk" | "emulator" | "console" | "journey";

export interface ConnectedDevice {
  deviceId: string;
  role: "kiosk" | "host";
  kind: ClientKind;
  /** Kiosk: physical seat position 1-4 (operator setting), if configured. */
  seat?: number;
  /** ISO time the socket said hello. */
  connectedAt: string;
  /** The engine.io transport in use — polling on the cabin WLAN is a smell. */
  transport: "websocket" | "polling";
  /** Kiosks: last rider/agent interaction; null for consoles. */
  lastActivityAt: string | null;
  /** Kiosks: a visitor session is running. */
  active: boolean;
  /** Last ping round-trip in ms; null until probed or when unanswered. */
  rttMs: number | null;
  probedAt: string | null;
  health: DeviceHealth;
}

/** High-level conversation phase, used to mask latency in the UI. */
export type PipelinePhase = "idle" | "listening" | "thinking" | "speaking";

/** Live summary of one kiosk seat, for the operator console. */
export interface SeatSummary {
  deviceId: string;
  persona: PersonaKey;
  personaLabel: string;
  /** The seat's live accommodations (may diverge from the profile this session). */
  accommodations: Accommodations;
  /** What CoSiMo has remembered about this rider (notes; empty for anon/presets). */
  memories: string[];
  emotion: FaceEmotion;
  phase: PipelinePhase;
  /** Visitor consent decision (recording), if made this session. */
  consent: boolean;
  /** A visitor session is in progress at this seat. */
  active: boolean;
  /** Last visitor utterance / last CoSiMo reply (live view, truncated). */
  lastUser: string;
  lastReply: string;
  /** This seat's own controls — seat-scoped only (reading lamp). The
   *  cabin-scoped state travels beside the seats on `host:seats`. */
  controls: CabinControlState[];
}

/** Deep view of one seat's conversation, for the host console inspector. */
export interface SeatInspection {
  deviceId: string;
  sessionId: string;
  persona: PersonaKey;
  /** The exact system prompt a turn on this seat would use right now
   *  (CMS core + rider section incl. brief, prelude, memories). */
  systemPrompt: string;
  /** The recorded conversation (incl. tool actions, outcomes, latencies). */
  turns: Turn[];
}

export interface ConnectionStatus {
  llm: boolean;
  /** Payload reachable. CMS down is DEGRADED, not dead: built-in profiles
   *  and route keep the demo alive — but edits and session writes stall. */
  cms: boolean;
  speech: boolean;
  /** The cabin lamp path: LPU-2 address known and the last real switch confirmed by the seat. */
  light: boolean;
  network: boolean;
  /** True when serving the scripted offline demo. */
  offlineCanned: boolean;
  /** Server-side STT available → clients upload audio instead of using Web Speech. */
  serverStt: boolean;
  /** Server-side TTS available → clients play tts:chunk instead of Web Speech. */
  serverTts: boolean;
}

/** A streamed speech clip (one sentence) or the turn's end marker. */
export interface TtsChunk {
  sessionId: string;
  turn: number;
  seq: number;
  /** End marker: no audio, the turn's speech is complete once played out. */
  last: boolean;
  audioBase64: string;
  mime: string;
  /** The sentence this clip speaks — the slit shows it as a caption while
   *  the clip plays (empty on the end marker). */
  text?: string;
}

/** Per-request generation settings (CMS-editable, applied live). */
export interface LlmGeneration {
  /** 0.1–1.0 — 1.0 produced degenerate one-token replies on Qwen (2026-08-23). */
  temperature: number;
  /** 0.5–1.0 */
  topP: number;
  /** 128–2048 */
  maxTokens: number;
  /** 1.0–1.3 (vLLM extra; ignored by Anthropic) */
  repetitionPenalty: number;
  /** Qwen thinking mode per request (chat_template_kwargs); costs latency. */
  thinking: boolean;
}

/**
 * What the hub is actually routing to right now, for the operator console:
 * the CMS operator-config merged over the env defaults. `source` says
 * whether the CMS copy was ever loaded (a CMS outage keeps the last one).
 */
export interface HostConfigBroadcast {
  source: "cms" | "defaults";
  /** ISO time the CMS copy was last loaded; null while on defaults. */
  loadedAt: string | null;
  llm: { provider: string; baseUrl: string; model: string; fallback: { provider: string; baseUrl: string; model: string } | null; generation: LlmGeneration };
  stt: { baseUrl: string; model: string };
  tts: { baseUrl: string; model: string; voices: number; /** The catalog, for the console's per-voice test buttons. */ voiceList: { key: string; label: string; gender: "female" | "male" }[] };
  cabin: {
    lpu2BaseUrl: string;
    mapped: number;
    controls: number;
    timeoutMs: number;
    /** One row per LPU-2 catalog key (packages/shared cabin.ts LPU2_KEYS):
     *  which playback drives it (null = not assigned in the CMS, simulated
     *  only) and the exact URLs the kiosk fires for an (`go`) / aus (`re`) —
     *  so the mapping can be checked against the LPU-2 without a cabin.
     *  `rider` keys are reachable through CoSiMo, `zone`/`signal` keys only
     *  through the console's light buttons. */
    routes: {
      key: string; label: string; group: "rider" | "zone" | "signal";
      playback: number | null;
      on: string | null;
      off: string | null;
    }[];
  };
  /** The system prompt as the agent builds it right now (core + voice
   *  catalog, default rider) — for the console's prompt popup. */
  systemPrompt: string;
  /** The agent's tool definitions as sent to the model (name, description,
   *  JSON schema) — for the console's tools popup. */
  tools: { name: string; description: string; schema: unknown }[];
}

/** Result of a console-triggered LLM round-trip (no seat involved). */
export interface LlmTestResult {
  ok: boolean;
  provider: string;
  model: string;
  ms: number;
  text?: string;
  error?: string;
}

/**
 * Result of a console-triggered speech round-trip. TTS: one fixed sentence
 * synthesized on the live route (the audio comes back so the console can
 * play it). STT: that same synthesized sentence transcribed on the live
 * route — `ms` is the recognition alone, `text` what came back.
 */
export interface SpeechTestResult {
  ok: boolean;
  /** TTS: which catalog voice was used (key), or "default". */
  voice?: string;
  route: string;
  model: string;
  ms: number;
  text?: string;
  bytes?: number;
  audioBase64?: string;
  mime?: string;
  error?: string;
}

/** One deployable as the hub sees it, for the console's Services card. */
export interface ServiceInfo {
  id: "cms" | "realtime" | "console" | "emulator" | "journey";
  label: string;
  /** ok = answered the probe; down = probe failed; unknown = not configured here. */
  status: "ok" | "down" | "unknown";
  /** Public hostname (Cloudflare) — null when not configured (dev). */
  publicHost: string | null;
  /** Where the hub reaches it (compose service name or localhost). */
  internalUrl: string | null;
  /** The port the process listens on inside its container / on the dev box. */
  port: number | null;
  /** Compose service name, and the container hostname when known (the hub knows its own). */
  container: string | null;
  latencyMs: number | null;
  checkedAt: string | null;
  /** True when the hub itself runs inside Docker. */
  docker: boolean;
  /** True when the hub can restart this container (Docker proxy configured). */
  restartable: boolean;
}

/** Events the server pushes to clients. */
export interface ServerToClientEvents {
  /** Current Face emotion to render (morph target). */
  "face:emotion": (payload: { emotion: FaceEmotion; since: string }) => void;
  /** Pipeline phase change (drives mechanical emotion + thinking UI). */
  "pipeline:phase": (payload: { phase: PipelinePhase; sessionId: string }) => void;
  /**
   * Streamed assistant text (token chunks) for latency masking. `turn` is the
   * seat's monotonically increasing turn number — clients drop chunks from a
   * turn lower than the highest they've seen (stale after a barge-in) and
   * reset their reply view when a higher one starts. -1 = wildcard (recover).
   */
  "chat:delta": (payload: { sessionId: string; text: string; done: boolean; turn: number }) => void;
  /** Full cabin state broadcast (all controls). */
  "cabin:state": (payload: { controls: CabinControlState[] }) => void;
  /** Perform this change on the cabin LAN (kiosks only — they are the only
   *  devices on that network). Sent alongside `cabin:state` to the owning
   *  seat; answer with `cabin:actuate:result` so the hub knows if it landed. */
  "cabin:actuate": (payload: CabinActuation) => void;
  /** Telemetry snapshot for the on-screen display. */
  "telemetry:update": (payload: MonoCabTelemetry) => void;
  /** Active persona changed (host console or auto) — carries theme + a11y. */
  "persona:active": (payload: PersonaBroadcast) => void;
  /** What CoSiMo heard from a voice utterance (server STT), echoed for display. */
  "voice:transcript": (payload: { sessionId: string; text: string; lang: Locale }) => void;
  /** Synthesized speech to play (server TTS). When absent, clients speak locally.
   *  Carries the turn number — stale clips (barged-in turns) are dropped. */
  /**
   * One sentence of synthesized speech (streaming TTS): chunks of a turn are
   * numbered `seq` from 0 and play back-to-back in order; the final message
   * carries `last: true` with empty audio as an end marker.
   */
  "tts:chunk": (payload: TtsChunk) => void;

  /** Show (or clear, card=null) the seat's option/info card. */
  "seat:card": (payload: { sessionId: string; card: SeatCard | null; turn: number }) => void;
  /** Service/health status for the host console. */
  "status:update": (payload: ConnectionStatus) => void;
  /** Host forced a session reset on this device. */
  /**
   * A NEW session on this seat — the hub owns session ids: a persona switch
   * (NFC login, host), a host reset. The client adopts `sessionId`, clears
   * its conversation view and, unless `consent` is a stored decision (card
   * riders), shows the consent screen again. `"*"` = every seat.
   */
  "session:reset": (payload: { deviceId: string; sessionId?: string; consent?: boolean | null }) => void;
  /** Currently connected devices (for the operator console). */
  "devices:update": (payload: { devices: ConnectedDevice[] }) => void;
  /** Per-seat live summaries (host consoles only). `cabin` is the shared
   *  cabin-scoped control state (one interior light for all seats). */
  "host:seats": (payload: { seats: SeatSummary[]; cabin: CabinControlState[] }) => void;
  /** The set of authored personas (host consoles only) — drives the pickers.
   *  Sent on host connect and whenever the persona set is refreshed from CMS. */
  "host:personas": (payload: { personas: PersonaBroadcast[] }) => void;
  /** Link check: the client answers by calling the ack — no payload. */
  "sys:ping": (ack: () => void) => void;
  /** A console's token was refused — the page should lock again. */
  "host:unauthorized": (payload: { reason: "token" }) => void;
  /** Outcome of a host:restart-service. */
  "host:restart-result": (payload: { id: ServiceInfo["id"]; ok: boolean; error?: string }) => void;
  /** Answer to host:llm-test. */
  "host:llm-test-result": (payload: LlmTestResult) => void;
  /** Answers to host:tts-test / host:stt-test. */
  "host:tts-test-result": (payload: SpeechTestResult) => void;
  "host:stt-test-result": (payload: SpeechTestResult) => void;
  /** The deployables and their reachability — pushed to host consoles on hello and on change. */
  "host:services": (payload: { services: ServiceInfo[] }) => void;
  /** A console should reload itself (another console reset everything). */
  "host:reload": (payload: { by: string }) => void;
  /** This console was the oldest of too many and is being disconnected. */
  "host:evicted": (payload: { max: number; by: string }) => void;
  /** The resolved operator routing (CMS operator-config over env defaults) —
   *  pushed to host consoles on hello and whenever it changes. URLs and
   *  model names only; keys never leave the hub's environment. */
  "host:config": (payload: HostConfigBroadcast) => void;
  /** Reply to host:inspect — sent only to the requesting host socket. */
  "host:inspect:result": (payload: SeatInspection) => void;
  /** The structured debug log (host consoles only): a replay batch on
   *  connect, then one event at a time as they happen. See log.ts. */
  "host:log": (payload: { events: LogEvent[]; replay: boolean }) => void;
}

/** Events clients send to the server. */
export interface ClientToServerEvents {
  /** Identify which iPad/role is connecting. */
  /** `token`: consoles send the SHA-256 of the operator password; the hub
   *  compares it with its HOST_TOKEN. Journey views and seats send none. */
  hello: (payload: { deviceId: string; role: "kiosk" | "host"; kind?: ClientKind; token?: string; /** Kiosk: physical seat position 1-4 (operator setting) — picks the reading-lamp playback. */ seat?: number }) => void;
  /** Push-to-talk pressed/released — drives the listening Face/phase. */
  "ptt:start": (payload: { sessionId: string }) => void;
  "ptt:stop": (payload: { sessionId: string }) => void;
  /** A recorded voice utterance for server-side STT (when serverStt is on). */
  "voice:utterance": (payload: {
    sessionId: string;
    audioBase64: string;
    mime: string;
    lang: Locale;
  }) => void;
  /** Text or browser-transcribed message. `modality` marks how it originated. */
  "chat:send": (payload: {
    sessionId: string;
    text: string;
    lang: Locale;
    modality?: Modality;
  }) => void;
  /** Answer to a LOCAL card (hub-handled: themes, voices, scales, wizard). */
  "card:answer": (payload: { sessionId: string; cardId: string; value: string }) => void;
  /** The ↻ affordance: say the last reply again (no LLM round). */
  "reply:repeat": (payload: { sessionId: string }) => void;
  /** Visitor consent decision for recording. */
  "consent:set": (payload: { sessionId: string; consent: boolean }) => void;
  /** Outcome of a `cabin:actuate` — a failure marks the control degraded. */
  "cabin:actuate:result": (payload: CabinActuationResult) => void;
  /** An NFC chip was scanned at this kiosk (chip id → persona "account"). */
  "nfc:register": (payload: { sessionId: string; tagId: string; lang: Locale }) => void;

  // ── Host console actions ──
  /** Without deviceId: all seats. With deviceId: that seat only. */
  "host:setPersona": (payload: { persona: PersonaKey; deviceId?: string }) => void;
  /** Change a cabin control. For a cabin-scoped control the deviceId only
   *  says who asked (any connected seat id works); exactly one of on /
   *  level / scene / flash applies, matching the control's kind. */
  "host:overrideLight": (payload: { deviceId: string; control: CabinControlId; on?: boolean; level?: number; scene?: string; flash?: true }) => void;
  "host:resetSession": (payload: { deviceId: string }) => void;
  "host:toggleOffline": (payload: { offline: boolean }) => void;
  /** Force a live telemetry change (open doors, halt, …) for the demo. */
  "host:patchTelemetry": (payload: HostTelemetryPatch) => void;
  /** Recover a stuck conversation: settle phase to idle and the Face to neutral. */
  "host:recover": (payload: Record<string, never>) => void;
  /** Request a deep view of one seat (system prompt + full turn log). */
  "host:inspect": (payload: { deviceId: string }) => void;
  /** Run the link check on every device now (the periodic one runs anyway). */
  "host:probe": (payload: Record<string, never>) => void;
  /** Reset one device: a seat goes back to its consent screen
   *  (session:reset), a journey view or console gets host:reload. Nothing
   *  is disconnected — the device shows what happened. */
  "host:reset-device": (payload: { deviceId: string }) => void;
  /** Restart a deployable's container via the Docker socket proxy (prod). */
  "host:restart-service": (payload: { id: ServiceInfo["id"] }) => void;
  /** Console "Testen": one short generation on the current LLM route. */
  /** Console light buttons: a catalog key (zone/signal) toggled on/off, or a
   *  global — "blackout" (on/off), "release-all", "hello" (LPU-2 test). The
   *  hub builds the URLs and routes them to one healthy kiosk. */
  "host:light": (payload: { key: string; on?: boolean }) => void;
  /** The same rig actions from a kiosk's hidden operator menu — that iPad fires them itself. */
  "cabin:light": (payload: { key: string; on?: boolean }) => void;
  "host:llm-test": (payload: Record<string, never>) => void;
  /** Console "Testen" on the TTS / STT cards: one round-trip on the live route, no seat. */
  "host:tts-test": (payload: { /** Catalog voice key; omitted = the default voice. */ voice?: string }) => void;
  "host:stt-test": (payload: Record<string, never>) => void;
  /** Reset everything: every seat back to the consent screen (session:reset
   *  "*"), every *other* console told to reload (host:reload). */
  "host:reset-all": (payload: Record<string, never>) => void;
  /** Re-request the log buffer, optionally only events after `since` (seq). */
  "host:log:replay": (payload: { since?: number }) => void;
}
