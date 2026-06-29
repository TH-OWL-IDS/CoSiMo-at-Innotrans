/**
 * The WebSocket hub — single source of truth for shared showcase state, kept in
 * sync across all four iPads. Phase 0 wires the connection lifecycle and the
 * broadcast plumbing; later phases plug the agent loop, light driver, telemetry
 * and persona engine into these same channels.
 */

import type { Server, Socket } from "socket.io";
import {
  CABIN_CONTROLS,
  type CabinControlState,
  type ClientToServerEvents,
  type ConnectionStatus,
  type FaceEmotion,
  type PersonaKey,
  type ServerToClientEvents,
} from "@cosimo/shared";

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

  get connectedDevices(): number {
    return this.devices.size;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
