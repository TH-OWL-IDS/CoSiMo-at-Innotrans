/**
 * The WebSocket hub — single source of truth for shared showcase state, kept in
 * sync across all four iPads. Phase 0 wires the connection lifecycle and the
 * broadcast plumbing; later phases plug the agent loop, light driver, telemetry
 * and persona engine into these same channels.
 */

import type { Server, Socket } from "socket.io";
import type { LightDriver } from "./cabin/driver.js";
import {
  CABIN_CONTROLS,
  type CabinControlId,
  type CabinControlState,
  type ClientToServerEvents,
  type ConnectedDevice,
  type ConnectionStatus,
  type FaceEmotion,
  type Locale,
  type Modality,
  type MonoCabTelemetry,
  type PersonaBroadcast,
  type PersonaKey,
  type PipelinePhase,
  type ServerToClientEvents,
} from "@cosimo/shared";

/** Resolves a persona key to its client-facing broadcast slice. */
export type PersonaResolver = (key: PersonaKey) => PersonaBroadcast;

const DEFAULT_PERSONA_BROADCAST: PersonaBroadcast = {
  persona: "default",
  label: { de: "Standard", en: "Default" },
  themeId: "classic",
  presentation: { highContrast: false, largeText: false, speakAloud: true },
};

/** A user turn the hub hands off to the agent. */
export interface IncomingChat {
  sessionId: string;
  deviceId: string;
  text: string;
  lang: Locale;
  persona: PersonaKey;
  modality: Modality;
  consent: boolean;
}

export type ChatHandler = (chat: IncomingChat) => void;

/** A recorded voice utterance the hub hands off for server-side STT. */
export interface IncomingVoice {
  sessionId: string;
  deviceId: string;
  audioBase64: string;
  mime: string;
  lang: Locale;
  persona: PersonaKey;
  consent: boolean;
}

export type VoiceHandler = (voice: IncomingVoice) => void;

type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

interface HubState {
  emotion: FaceEmotion;
  persona: PersonaBroadcast;
  controls: CabinControlState[];
  status: ConnectionStatus;
}

export class Hub {
  private readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly devices = new Map<string, { role: "kiosk" | "host" }>();
  private chatHandler: ChatHandler | undefined;
  private voiceHandler: VoiceHandler | undefined;
  private lightDriver: LightDriver | undefined;
  private personaResolver: PersonaResolver | undefined;
  private lastTelemetry: MonoCabTelemetry | undefined;
  private readonly consentBySession = new Map<string, boolean>();
  // Offline-mode inputs: host can force it; the health monitor sets network.
  private llmConfigured = false;
  private networkOk = true;
  private manualOffline = false;

  private state: HubState = {
    emotion: "sleeping",
    persona: DEFAULT_PERSONA_BROADCAST,
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
      serverStt: false,
      serverTts: false,
    },
  };

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io;
  }

  /** Register the agent that handles incoming user turns. */
  onChat(handler: ChatHandler): void {
    this.chatHandler = handler;
  }

  /** Register the handler for recorded voice utterances (server STT). */
  onVoice(handler: VoiceHandler): void {
    this.voiceHandler = handler;
  }

  /** Attach the hardware light driver and reflect its kind in the status. */
  attachLightDriver(driver: LightDriver): void {
    this.lightDriver = driver;
    this.setStatus({ light: true });
  }

  /** Register how persona keys resolve to client-facing broadcasts. */
  setPersonaResolver(resolver: PersonaResolver): void {
    this.personaResolver = resolver;
    // Re-resolve the current persona now that we can.
    this.setPersona(this.state.persona.persona);
  }

  register(socket: Sock): void {
    socket.on("hello", ({ deviceId, role }) => {
      this.devices.set(deviceId, { role });
      socket.data.deviceId = deviceId;
      this.broadcastDevices();
      // Snapshot current state to the freshly-connected client.
      socket.emit("face:emotion", { emotion: this.state.emotion, since: this.now() });
      socket.emit("persona:active", this.state.persona);
      socket.emit("cabin:state", { controls: this.state.controls });
      socket.emit("status:update", this.state.status);
      if (this.lastTelemetry) socket.emit("telemetry:update", this.lastTelemetry);
    });

    // Visitor consent for recording (GDPR) — gates how the session is stored.
    socket.on("consent:set", ({ sessionId, consent }) => {
      this.consentBySession.set(sessionId, consent);
    });

    // Text or browser-transcribed message → hand to the agent.
    socket.on("chat:send", ({ sessionId, text, lang, modality }) => {
      const deviceId = (socket.data.deviceId as string | undefined) ?? "unknown";
      this.chatHandler?.({
        sessionId, deviceId, text, lang,
        persona: this.state.persona.persona,
        modality: modality ?? "text",
        consent: this.consentBySession.get(sessionId) ?? false,
      });
    });

    // Push-to-talk → reflect listening on the Face/phase while capturing.
    socket.on("ptt:start", ({ sessionId }) => {
      this.emitPhase("listening", sessionId);
      this.setEmotion("listening");
    });
    socket.on("ptt:stop", ({ sessionId }) => {
      this.emitPhase("idle", sessionId);
    });

    // Recorded utterance → server-side STT pipeline.
    socket.on("voice:utterance", ({ sessionId, audioBase64, mime, lang }) => {
      const deviceId = (socket.data.deviceId as string | undefined) ?? "unknown";
      this.voiceHandler?.({
        sessionId, deviceId, audioBase64, mime, lang,
        persona: this.state.persona.persona,
        consent: this.consentBySession.get(sessionId) ?? false,
      });
    });

    // Host console actions.
    socket.on("host:setPersona", ({ persona }) => this.setPersona(persona));
    socket.on("host:overrideLight", ({ control, on }) => {
      void this.applyCabinControl(control, { on });
    });
    socket.on("host:resetSession", ({ deviceId }) =>
      this.io.emit("session:reset", { deviceId }),
    );
    socket.on("host:toggleOffline", ({ offline }) => {
      this.manualOffline = offline;
      this.recomputeStatus();
    });
    socket.on("host:patchTelemetry", (patch) => this.patchTelemetry(patch));
    socket.on("host:recover", () => {
      this.io.emit("pipeline:phase", { phase: "idle", sessionId: "*" });
      this.io.emit("chat:delta", { sessionId: "*", text: "", done: true });
      this.setEmotion("neutral");
    });

    socket.on("disconnect", () => {
      const id = socket.data.deviceId as string | undefined;
      if (id) this.devices.delete(id);
      this.broadcastDevices();
    });
  }

  private broadcastDevices(): void {
    const devices: ConnectedDevice[] = Array.from(this.devices, ([deviceId, d]) => ({
      deviceId,
      role: d.role,
    }));
    this.io.emit("devices:update", { devices });
  }

  /** Apply a host-forced telemetry override and rebroadcast. */
  private patchTelemetry(patch: {
    speedKmh?: number;
    doorsOpen?: boolean;
    batteryPct?: number;
    occupancy?: number;
  }): void {
    if (!this.lastTelemetry) return;
    this.emitTelemetry({ ...this.lastTelemetry, ...patch });
  }

  // ── Broadcast helpers (used by the agent loop / drivers in later phases) ──

  setEmotion(emotion: FaceEmotion): void {
    this.state.emotion = emotion;
    this.io.emit("face:emotion", { emotion, since: this.now() });
  }

  /** Switch the active persona (resolved to its broadcast) and notify clients. */
  setPersona(persona: PersonaKey): void {
    this.state.persona = this.personaResolver
      ? this.personaResolver(persona)
      : { ...DEFAULT_PERSONA_BROADCAST, persona };
    this.io.emit("persona:active", this.state.persona);
  }

  setStatus(patch: Partial<ConnectionStatus>): void {
    this.state.status = { ...this.state.status, ...patch };
    this.io.emit("status:update", this.state.status);
  }

  /** Record whether an LLM key is configured (drives the llm status + canned mode). */
  setLlmConfigured(configured: boolean): void {
    this.llmConfigured = configured;
    this.recomputeStatus();
  }

  /** Health monitor reports network reachability. */
  setNetwork(ok: boolean): void {
    if (ok === this.networkOk) return;
    this.networkOk = ok;
    this.recomputeStatus();
  }

  /** True when CoSiMo should serve scripted canned replies instead of the LLM. */
  isOfflineMode(): boolean {
    return this.state.status.offlineCanned;
  }

  /** Derive llm/network/offlineCanned from the inputs and broadcast once. */
  private recomputeStatus(): void {
    this.setStatus({
      network: this.networkOk,
      llm: this.llmConfigured && this.networkOk,
      offlineCanned: this.manualOffline || !this.networkOk,
    });
  }

  /** Conversation phase → drives the thinking UI and mechanical Face emotion. */
  emitPhase(phase: PipelinePhase, sessionId: string): void {
    this.io.emit("pipeline:phase", { phase, sessionId });
  }

  /** Stream a chunk of CoSiMo's reply text to all clients (latency masking). */
  emitChatDelta(sessionId: string, text: string, done: boolean): void {
    this.io.emit("chat:delta", { sessionId, text, done });
  }

  /** Broadcast a telemetry snapshot to the on-screen displays (and cache it). */
  emitTelemetry(telemetry: MonoCabTelemetry): void {
    this.lastTelemetry = telemetry;
    this.io.emit("telemetry:update", telemetry);
  }

  /** Echo what CoSiMo heard from a voice utterance (server STT). */
  emitTranscript(sessionId: string, text: string, lang: Locale): void {
    this.io.emit("voice:transcript", { sessionId, text, lang });
  }

  /** Send synthesized speech for the clients to play (server TTS). */
  emitTtsAudio(sessionId: string, audioBase64: string, mime: string): void {
    this.io.emit("tts:audio", { sessionId, audioBase64, mime });
  }

  /**
   * Apply a cabin-control change and broadcast the new state to every iPad.
   * The real `interior-light` is driven through the hardware LightDriver; the
   * others are simulated in memory. If the real device is unreachable we mark
   * the control `degraded`, keep showing last-known intent, and flag the light
   * status — the demo never breaks on a hardware hiccup.
   */
  async applyCabinControl(
    control: CabinControlId,
    change: { on?: boolean; level?: number },
  ): Promise<CabinControlState> {
    const entry = this.state.controls.find((c) => c.id === control);
    if (!entry) throw new Error(`unknown cabin control: ${control}`);
    const def = CABIN_CONTROLS.find((c) => c.id === control);

    if (def?.real && change.on !== undefined && this.lightDriver) {
      try {
        await this.lightDriver.setOn(change.on);
        entry.degraded = false;
        if (!this.state.status.light) this.setStatus({ light: true });
      } catch (err) {
        entry.degraded = true;
        this.setStatus({ light: false });
        // eslint-disable-next-line no-console
        console.error(`[hub] light driver failed for ${control}:`, err);
      }
    }

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
