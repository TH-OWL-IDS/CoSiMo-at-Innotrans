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
import type { CabinControlState, CabinControlId } from "./cabin.js";
import type { Accommodations, PersonaBroadcast, PersonaKey } from "./persona.js";
import type { Modality } from "./session.js";

/** A device connected to the realtime hub (for the operator console). */
export interface ConnectedDevice {
  deviceId: string;
  role: "kiosk" | "host";
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
  /** This seat's cabin controls (reading lamp etc. are per seat). */
  controls: CabinControlState[];
}

export interface ConnectionStatus {
  llm: boolean;
  speech: boolean;
  light: boolean;
  network: boolean;
  /** True when serving the scripted offline demo. */
  offlineCanned: boolean;
  /** Server-side STT available → clients upload audio instead of using Web Speech. */
  serverStt: boolean;
  /** Server-side TTS available → clients play tts:audio instead of Web Speech. */
  serverTts: boolean;
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
  /** Telemetry snapshot for the on-screen display. */
  "telemetry:update": (payload: MonoCabTelemetry) => void;
  /** Active persona changed (host console or auto) — carries theme + a11y. */
  "persona:active": (payload: PersonaBroadcast) => void;
  /** What CoSiMo heard from a voice utterance (server STT), echoed for display. */
  "voice:transcript": (payload: { sessionId: string; text: string; lang: Locale }) => void;
  /** Synthesized speech to play (server TTS). When absent, clients speak locally.
   *  Carries the turn number — stale clips (barged-in turns) are dropped. */
  "tts:audio": (payload: { sessionId: string; audioBase64: string; mime: string; turn: number }) => void;
  /** Service/health status for the host console. */
  "status:update": (payload: ConnectionStatus) => void;
  /** Host forced a session reset on this device. */
  "session:reset": (payload: { deviceId: string }) => void;
  /** Currently connected devices (for the operator console). */
  "devices:update": (payload: { devices: ConnectedDevice[] }) => void;
  /** Per-seat live summaries (host consoles only). */
  "host:seats": (payload: { seats: SeatSummary[] }) => void;
  /** The set of authored personas (host consoles only) — drives the pickers.
   *  Sent on host connect and whenever the persona set is refreshed from CMS. */
  "host:personas": (payload: { personas: PersonaBroadcast[] }) => void;
}

/** Events clients send to the server. */
export interface ClientToServerEvents {
  /** Identify which iPad/role is connecting. */
  hello: (payload: { deviceId: string; role: "kiosk" | "host" }) => void;
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
  /** Visitor consent decision for recording. */
  "consent:set": (payload: { sessionId: string; consent: boolean }) => void;
  /** An NFC chip was scanned at this kiosk (chip id → persona "account"). */
  "nfc:register": (payload: { sessionId: string; tagId: string; lang: Locale }) => void;

  // ── Host console actions ──
  /** Without deviceId: all seats. With deviceId: that seat only. */
  "host:setPersona": (payload: { persona: PersonaKey; deviceId?: string }) => void;
  "host:overrideLight": (payload: { deviceId: string; control: CabinControlId; on: boolean }) => void;
  "host:resetSession": (payload: { deviceId: string }) => void;
  "host:toggleOffline": (payload: { offline: boolean }) => void;
  /** Force a live telemetry change (open doors, halt, …) for the demo. */
  "host:patchTelemetry": (payload: HostTelemetryPatch) => void;
  /** Recover a stuck conversation: settle phase to idle and the Face to neutral. */
  "host:recover": (payload: Record<string, never>) => void;
}
