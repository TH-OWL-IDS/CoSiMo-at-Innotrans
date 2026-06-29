/**
 * WebSocket contract between the realtime service (hub) and the iPad PWA
 * clients + host console. The realtime service is the single source of truth;
 * all four iPads stay in sync by subscribing to these server→client events.
 *
 * Typed for Socket.IO's generics:
 *   io.on("connection") uses Socket<ClientToServerEvents, ServerToClientEvents>
 */

import type { FaceEmotion } from "./emotion.js";
import type { MonoCabTelemetry, Locale } from "./telemetry.js";
import type { CabinControlState, CabinControlId } from "./cabin.js";
import type { PersonaBroadcast, PersonaKey } from "./persona.js";

/** High-level conversation phase, used to mask latency in the UI. */
export type PipelinePhase = "idle" | "listening" | "thinking" | "speaking";

export interface ConnectionStatus {
  llm: boolean;
  speech: boolean;
  light: boolean;
  network: boolean;
  /** True when serving the scripted offline demo. */
  offlineCanned: boolean;
}

/** Events the server pushes to clients. */
export interface ServerToClientEvents {
  /** Current Face emotion to render (morph target). */
  "face:emotion": (payload: { emotion: FaceEmotion; since: string }) => void;
  /** Pipeline phase change (drives mechanical emotion + thinking UI). */
  "pipeline:phase": (payload: { phase: PipelinePhase; sessionId: string }) => void;
  /** Streamed assistant text (token chunks) for latency masking. */
  "chat:delta": (payload: { sessionId: string; text: string; done: boolean }) => void;
  /** Full cabin state broadcast (all controls). */
  "cabin:state": (payload: { controls: CabinControlState[] }) => void;
  /** Telemetry snapshot for the on-screen display. */
  "telemetry:update": (payload: MonoCabTelemetry) => void;
  /** Active persona changed (host console or auto) — carries theme + a11y. */
  "persona:active": (payload: PersonaBroadcast) => void;
  /** Service/health status for the host console. */
  "status:update": (payload: ConnectionStatus) => void;
  /** Host forced a session reset on this device. */
  "session:reset": (payload: { deviceId: string }) => void;
}

/** Events clients send to the server. */
export interface ClientToServerEvents {
  /** Identify which iPad/role is connecting. */
  hello: (payload: { deviceId: string; role: "kiosk" | "host" }) => void;
  /** Push-to-talk pressed/released (Phase 4 wires audio capture to this). */
  "ptt:start": (payload: { sessionId: string }) => void;
  "ptt:stop": (payload: { sessionId: string }) => void;
  /** Text-fallback message. */
  "chat:send": (payload: { sessionId: string; text: string; lang: Locale }) => void;
  /** Visitor consent decision for recording. */
  "consent:set": (payload: { sessionId: string; consent: boolean }) => void;

  // ── Host console actions ──
  "host:setPersona": (payload: { persona: PersonaKey }) => void;
  "host:overrideLight": (payload: { control: CabinControlId; on: boolean }) => void;
  "host:resetSession": (payload: { deviceId: string }) => void;
  "host:toggleOffline": (payload: { offline: boolean }) => void;
}
