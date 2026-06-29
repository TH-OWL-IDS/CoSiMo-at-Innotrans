/**
 * The WebSocket hub — single source of truth for shared showcase state, kept in
 * sync across all four iPads. Phase 0 wires the connection lifecycle and the
 * broadcast plumbing; later phases plug the agent loop, light driver, telemetry
 * and persona engine into these same channels.
 */

import type { Server, Socket } from "socket.io";
import {
  CABIN_CONTROLS,
  type CabinControlId,
  type CabinControlState,
  type ClientToServerEvents,
  type ConnectionStatus,
  type FaceEmotion,
  type Locale,
  type MonoCabTelemetry,
  type PersonaKey,
  type PipelinePhase,
  type ServerToClientEvents,
} from "@cosimo/shared";

/** A user turn the hub hands off to the agent. */
export interface IncomingChat {
  sessionId: string;
  deviceId: string;
  text: string;
  lang: Locale;
  persona: PersonaKey;
}

export type ChatHandler = (chat: IncomingChat) => void;

type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

interface HubState {
  emotion: FaceEmotion;
  persona: PersonaKey;
  controls: CabinControlState[];
  status: ConnectionStatus;
}

export class Hub {
  private readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly devices = new Map<string, { role: "kiosk" | "host" }>();
  private chatHandler: ChatHandler | undefined;

  private state: HubState = {
    emotion: "sleeping",
    persona: "default",
    controls: CABIN_CONTROLS.map((c) => ({
      id: c.id,
      on: c.kind === "toggle" ? false : undefined,
      level: c.kind === "level" ? 0 : undefined,
    })),
    status: {
      llm: false,
      speech: false,
      light: false,
      network: true,
      offlineCanned: false,
    },
  };

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io;
  }

  /** Register the agent that handles incoming user turns. */
  onChat(handler: ChatHandler): void {
    this.chatHandler = handler;
  }

  register(socket: Sock): void {
    socket.on("hello", ({ deviceId, role }) => {
      this.devices.set(deviceId, { role });
      socket.data.deviceId = deviceId;
      // Snapshot current state to the freshly-connected client.
      socket.emit("face:emotion", { emotion: this.state.emotion, since: this.now() });
      socket.emit("persona:active", { persona: this.state.persona });
      socket.emit("cabin:state", { controls: this.state.controls });
      socket.emit("status:update", this.state.status);
    });

    // Text-fallback message → hand to the agent with device + active persona.
    socket.on("chat:send", ({ sessionId, text, lang }) => {
      const deviceId = (socket.data.deviceId as string | undefined) ?? "unknown";
      this.chatHandler?.({ sessionId, deviceId, text, lang, persona: this.state.persona });
    });

    // Host console actions (light/persona/etc. handled fully in later phases).
    socket.on("host:setPersona", ({ persona }) => this.setPersona(persona));
    socket.on("host:resetSession", ({ deviceId }) =>
      this.io.emit("session:reset", { deviceId }),
    );

    socket.on("disconnect", () => {
      const id = socket.data.deviceId as string | undefined;
      if (id) this.devices.delete(id);
    });
  }

  // ── Broadcast helpers (used by the agent loop / drivers in later phases) ──

  setEmotion(emotion: FaceEmotion): void {
    this.state.emotion = emotion;
    this.io.emit("face:emotion", { emotion, since: this.now() });
  }

  setPersona(persona: PersonaKey): void {
    this.state.persona = persona;
    this.io.emit("persona:active", { persona });
  }

  setStatus(patch: Partial<ConnectionStatus>): void {
    this.state.status = { ...this.state.status, ...patch };
    this.io.emit("status:update", this.state.status);
  }

  /** Conversation phase → drives the thinking UI and mechanical Face emotion. */
  emitPhase(phase: PipelinePhase, sessionId: string): void {
    this.io.emit("pipeline:phase", { phase, sessionId });
  }

  /** Stream a chunk of CoSiMo's reply text to all clients (latency masking). */
  emitChatDelta(sessionId: string, text: string, done: boolean): void {
    this.io.emit("chat:delta", { sessionId, text, done });
  }

  /** Broadcast a telemetry snapshot to the on-screen displays. */
  emitTelemetry(telemetry: MonoCabTelemetry): void {
    this.io.emit("telemetry:update", telemetry);
  }

  /**
   * Apply a cabin-control change and broadcast the new state to every iPad.
   * Phase 0/1 uses an in-memory (fake) state; Phase 2 swaps in the Shelly
   * driver for the real `interior-light` control.
   */
  applyCabinControl(
    control: CabinControlId,
    change: { on?: boolean; level?: number },
  ): CabinControlState {
    const entry = this.state.controls.find((c) => c.id === control);
    if (!entry) throw new Error(`unknown cabin control: ${control}`);
    if (change.on !== undefined) entry.on = change.on;
    if (change.level !== undefined) entry.level = change.level;
    this.io.emit("cabin:state", { controls: this.state.controls });
    return entry;
  }

  get connectedDevices(): number {
    return this.devices.size;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
