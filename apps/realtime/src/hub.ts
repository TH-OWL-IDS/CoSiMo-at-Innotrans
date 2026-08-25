/**
 * The WebSocket hub. GLOBAL state — the journey (telemetry) and service
 * status — is shared across all iPads. Everything belonging to a seat —
 * persona, Face emotion, phases, replies, TTS, and the cabin controls
 * (reading lamp etc. are per seat) — is PER DEVICE: each iPad is its own
 * kiosk seat with its own session. Host consoles additionally receive a live
 * per-seat summary stream (host:seats).
 */

import type { Server, Socket } from "socket.io";
import type { LightDriver } from "./cabin/driver.js";
import { buildActuation, type Lpu2Config } from "./cabin/lpu2.js";
import { logger } from "./log/logger.js";
import { config } from "./config.js";
import {
  CABIN_CONTROLS,
  type Accommodations,
  type CabinControlId,
  type CabinControlState,
  type ClientToServerEvents,
  type ConnectedDevice,
  type ConnectionStatus,
  type FaceEmotion,
  type HostTelemetryPatch,
  type Locale,
  type Modality,
  type MonoCabTelemetry,
  type PersonaBroadcast,
  type PersonaKey,
  type PipelinePhase,
  type SeatCard,
  type SeatInspection,
  type SeatSummary,
  type ServerToClientEvents,
  type TtsChunk,
  type ClientKind,
  type DeviceHealth,
  type HostConfigBroadcast,
} from "@cosimo/shared";

/** Resolves a persona key to its client-facing broadcast slice. */
export type PersonaResolver = (key: PersonaKey) => PersonaBroadcast;

/** Lists every authored persona (for the host console pickers). */
export type PersonaLister = () => PersonaBroadcast[];

/** Resolves a profile key to its remembered notes (for the host console). */
export type MemoriesResolver = (key: PersonaKey) => string[];

const DEFAULT_PERSONA_BROADCAST: PersonaBroadcast = {
  persona: "default",
  label: "Standard",
  accommodations: {
    language: "de",
    theme: "classic",
    textSize: "m",
    contrast: "normal",
    audioOutput: true,
    speechRate: 1,
    showText: false,
    reduceMotion: false,
    input: "both",
    volume: 1,
    voiceGender: "female",
    voiceTone: "neutral",
  },
};

/** How much of the live conversation the host summary carries. */
const SNIPPET_MAX = 240;

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

/** An NFC scan the hub hands off for persona ("account") resolution. */
export interface IncomingNfc {
  sessionId: string;
  deviceId: string;
  tagId: string;
  lang: Locale;
}

export type NfcHandler = (nfc: IncomingNfc) => void;

/** Rider barge-in (talk button pressed while a turn runs) — abort that seat. */
export type InterruptHandler = (payload: { deviceId: string; sessionId: string }) => void;

/** Composes the host inspector view for one seat (system prompt + turns). */
export type InspectResolver = (deviceId: string) => SeatInspection | null;
export type CardAnswerHandler = (payload: { sessionId: string; deviceId: string; cardId: string; value: string; lang: Locale; persona: PersonaKey }) => void;
export type RepeatHandler = (payload: { sessionId: string; deviceId: string; lang: Locale; persona: PersonaKey }) => void;

type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Expressive emotions are reactions, not states — they fade back to neutral. */
const DECAYING_EMOTIONS: ReadonlySet<FaceEmotion> = new Set(["happy", "sad", "surprised"]);

/** How long a dropped kiosk's state (persona, consent, session, last
 *  exchange, cabin) waits for the same device id to come back. */
const PARK_MS = 10 * 60_000;

/** The part of a DeviceEntry that outlives its socket. */
type ParkedState = Pick<
  DeviceEntry,
  "persona" | "emotion" | "consent" | "active" | "sessionId" | "lastUser" | "lastReply" | "lastReplyFull" | "controls" | "turn" | "lastActivity"
> & { parkedAt: number };

/** At most this many consoles at once — the oldest is evicted for a new one,
 *  so forgotten tabs can't pile up. */
const MAX_HOST_CONSOLES = Number(process.env.MAX_HOST_CONSOLES ?? 3);

/** Link check tuning (see probeDevices). */
const PROBE_INTERVAL_MS = 10_000;
const PROBE_TIMEOUT_MS = 3_000;
const SLOW_RTT_MS = 250;
const LOST_LINGER_MS = 30_000;

/** The engine.io transport a socket currently rides. */
function transportOf(socket: Sock): "websocket" | "polling" {
  return socket.conn?.transport?.name === "websocket" ? "websocket" : "polling";
}

interface DeviceEntry {
  role: "kiosk" | "host";
  kind: ClientKind;
  socket: Sock;
  /** Link facts for the console's Verbindung card. */
  connectedAt: number;
  rttMs: number | null;
  probedAt: number | null;
  health: DeviceHealth;
  persona: PersonaBroadcast;
  emotion: FaceEmotion;
  phase: PipelinePhase;
  /** Last visitor/agent interaction — idle seats drift to the sleeping face. */
  lastActivity: number;
  /** This seat's cabin controls (per-seat reading lamp etc.). */
  controls: CabinControlState[];
  /** A visitor session is in progress (consent decided or first input). */
  active: boolean;
  consent: boolean;
  lastUser: string;
  lastReply: string;
  /** Untruncated last reply — for the ↻ "say it again" affordance. */
  lastReplyFull: string;
  /** The card currently in the slit (+ its auto-dismiss timer). */
  card?: SeatCard;
  cardTimer?: ReturnType<typeof setTimeout>;
  /** Customizer wizard progress (step index) while it runs. */
  wizardStep?: number;
  /** Accumulates streamed reply text until the turn is done. */
  replyBuffer: string;
  /** Monotonically increasing turn number — stale turns are dropped client-side. */
  turn: number;
  /** Latest session seen on this seat (for the host inspector). */
  sessionId: string;
  /** Host consoles: unsubscribes this socket from the debug log stream. */
  unsubscribeLog?: () => void;
}

function freshControls(): CabinControlState[] {
  return CABIN_CONTROLS.map((c) => ({
    id: c.id,
    on: c.kind === "toggle" ? false : undefined,
    level: c.kind === "level" ? 0 : undefined,
  }));
}

export class Hub {
  private readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly devices = new Map<string, DeviceEntry>();
  /** Which device a session lives on — routes conversation events. */
  private readonly sessionDevice = new Map<string, string>();
  private chatHandler: ChatHandler | undefined;
  private voiceHandler: VoiceHandler | undefined;
  private nfcHandler: NfcHandler | undefined;
  private interruptHandler: InterruptHandler | undefined;
  private telemetryPatchHandler: ((patch: HostTelemetryPatch) => void) | undefined;
  private lightDriver: LightDriver | undefined;
  /** How to reach the cabin's DMX controller — resolved per change so an
   *  operator edit (new IP on mounting day) applies without a restart. */
  private lpu2Config: (() => Lpu2Config) | undefined;
  private personaResolver: PersonaResolver | undefined;
  private personaLister: PersonaLister | undefined;
  private configLister: (() => HostConfigBroadcast) | undefined;
  /** Recently disconnected devices, shown as "lost" for LOST_LINGER_MS. */
  private readonly lost = new Map<string, ConnectedDevice>();
  /** Dropped kiosks' state, waiting PARK_MS for the same id to return. */
  private readonly parked = new Map<string, ParkedState>();
  /** Last config pushed, serialized — broadcastConfig() only emits on change. */
  private lastConfigJson = "";
  private memoriesResolver: MemoriesResolver | undefined;
  private inspectResolver: InspectResolver | undefined;
  private cardAnswerHandler: CardAnswerHandler | undefined;
  private repeatHandler: RepeatHandler | undefined;
  private lastTelemetry: MonoCabTelemetry | undefined;
  private readonly consentBySession = new Map<string, boolean>();
  // Offline-mode inputs: host can force it; the health monitor sets network.
  private llmConfigured = false;
  /** Set by the health monitor's LLM probe (primary or fallback answering). */
  private llmReachable = true;
  private networkOk = true;
  private manualOffline = false;

  private status: ConnectionStatus = {
    llm: false,
    cms: false,
    speech: false,
    light: false,
    network: true,
    offlineCanned: false,
    serverStt: false,
    serverTts: false,
  };

  /** Pending expressive-emotion decay per seat (deviceId → timer). */
  private readonly decayTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Per-second inbound event counters — a client stuck in a send loop once
   *  flooded chat:send at ~7.5k/s and OOM'd the process; this names the
   *  offender (event, device, sample) the moment a flood starts. */
  private readonly eventCounts = new Map<string, number>();
  private eventSample = "";

  private countEvent(event: string, deviceId: string, sample?: string): void {
    const key = `${event} ${deviceId}`;
    this.eventCounts.set(key, (this.eventCounts.get(key) ?? 0) + 1);
    if (sample) this.eventSample = sample;
  }

  /** Per-device token bucket for turn-starting events (burst 3, 1/s refill).
   *  A runaway client (WKWebView speech once sent 400 identical turns/s)
   *  must never OOM the hub — excess turns are dropped, visible in [flood]. */
  private readonly turnBudget = new Map<string, { tokens: number; last: number }>();

  private allowTurn(deviceId: string): boolean {
    const now = Date.now();
    const b = this.turnBudget.get(deviceId) ?? { tokens: 3, last: now };
    b.tokens = Math.min(3, b.tokens + (now - b.last) / 1000);
    b.last = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.turnBudget.set(deviceId, b);
    return ok;
  }

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io;
    // Attract mode: seats nobody has touched for a while drift to sleep.
    const sweep = setInterval(() => this.sweepIdleSeats(), 15_000);
    sweep.unref?.();
    const rate = setInterval(() => {
      let total = 0;
      for (const n of this.eventCounts.values()) total += n;
      if (total > 50) {
        const top = [...this.eventCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
        // eslint-disable-next-line no-console
        console.warn(
          `[flood] ${total} client events/s — top: ${top.map(([k, n]) => `${k}=${n}`).join(", ")} | sample: ${this.eventSample.slice(0, 80)}`,
        );
      }
      this.eventCounts.clear();
      this.eventSample = "";
    }, 1000);
    rate.unref?.();
  }

  /** Emit + store a face emotion for one seat. Internal transitions (decay,
   *  sleep) use this directly so they don't count as activity. */
  private emitEmotion(entry: DeviceEntry, emotion: FaceEmotion): void {
    entry.emotion = emotion;
    entry.socket.emit("face:emotion", { emotion, since: this.now() });
  }

  private clearDecay(deviceId: string): void {
    const t = this.decayTimers.get(deviceId);
    if (t) clearTimeout(t);
    this.decayTimers.delete(deviceId);
  }

  /** Idle seats (no interaction, conversation settled) fall asleep. */
  private sweepIdleSeats(): void {
    const now = Date.now();
    let changed = false;
    for (const [deviceId, e] of this.devices) {
      if (e.role !== "kiosk" || e.emotion === "sleeping" || e.phase !== "idle") continue;
      if (now - e.lastActivity < config.face.idleSleepMs) continue;
      this.clearDecay(deviceId);
      this.emitEmotion(e, "sleeping");
      changed = true;
    }
    if (changed) this.pushSeats();
  }

  /** Register the agent that handles incoming user turns. */
  onChat(handler: ChatHandler): void {
    this.chatHandler = handler;
  }

  /** Register the handler for recorded voice utterances (server STT). */
  onVoice(handler: VoiceHandler): void {
    this.voiceHandler = handler;
  }

  /** Register the handler for NFC scans (persona/"account" resolution). */
  onNfc(handler: NfcHandler): void {
    this.nfcHandler = handler;
  }

  /** Register the handler for rider barge-in (talk button during a turn). */
  onInterrupt(handler: InterruptHandler): void {
    this.interruptHandler = handler;
  }

  /** Register how a seat's deep inspection (prompt + turns) is composed. */
  onCardAnswer(handler: CardAnswerHandler): void {
    this.cardAnswerHandler = handler;
  }

  onRepeat(handler: RepeatHandler): void {
    this.repeatHandler = handler;
  }

  onInspect(resolver: InspectResolver): void {
    this.inspectResolver = resolver;
  }

  /** Latest session seen on a seat ("" before any interaction). */
  sessionOf(deviceId: string): string {
    return this.devices.get(deviceId)?.sessionId ?? "";
  }

  /**
   * Register how the cabin controller is addressed. The hub never calls it —
   * it hands the built URLs to the seat, which is on the cabin LAN.
   */
  setCabinActuator(resolve: () => Lpu2Config): void {
    this.lpu2Config = resolve;
  }

  /** Attach the hardware light driver and reflect its kind in the status. */
  attachLightDriver(driver: LightDriver): void {
    this.lightDriver = driver;
    this.setStatus({ light: true });
  }

  /** Register how persona keys resolve to client-facing broadcasts. */
  setPersonaResolver(resolver: PersonaResolver): void {
    this.personaResolver = resolver;
    // Re-resolve every device's persona now that we can.
    for (const [deviceId, entry] of this.devices) {
      if (entry.role === "kiosk") this.setPersonaForDevice(deviceId, entry.persona.persona);
    }
  }

  /** Register how the authored persona set is listed, and push it to hosts. */
  setPersonaLister(lister: PersonaLister): void {
    this.personaLister = lister;
    this.broadcastPersonas();
  }

  /** Register how a profile's remembered notes are resolved (host console). */
  setMemoriesResolver(resolver: MemoriesResolver): void {
    this.memoriesResolver = resolver;
  }

  /** Re-push the per-seat summaries (e.g. after CoSiMo remembers/forgets). */
  refreshSeats(): void {
    this.pushSeats();
  }

  /** Register how the resolved operator routing is read (host console). */
  setConfigLister(lister: () => HostConfigBroadcast): void {
    this.configLister = lister;
    this.broadcastConfig(true);
  }

  /** Push the operator routing to every host console — only when it changed,
   *  so the 15 s refresh doesn't spam. `force` re-sends regardless. */
  broadcastConfig(force = false): void {
    if (!this.configLister) return;
    const cfg = this.configLister();
    const json = JSON.stringify(cfg);
    if (!force && json === this.lastConfigJson) return;
    this.lastConfigJson = json;
    for (const e of this.devices.values()) {
      if (e.role === "host") e.socket.emit("host:config", cfg);
    }
  }

  /** Push the current authored persona set to every connected host console. */
  broadcastPersonas(): void {
    if (!this.personaLister) return;
    const personas = this.personaLister();
    for (const e of this.devices.values()) {
      if (e.role === "host") e.socket.emit("host:personas", { personas });
    }
  }

  register(socket: Sock): void {
    socket.on("hello", ({ deviceId, role, kind }) => {
      const entry: DeviceEntry = {
        role,
        // Old clients say nothing — assume the plain thing for their role.
        kind: kind ?? (role === "host" ? "console" : "kiosk"),
        socket,
        persona: this.resolvePersona("default"),
        emotion: "sleeping",
        phase: "idle",
        controls: freshControls(),
        active: false,
        consent: false,
        lastUser: "",
        lastReply: "",
        lastReplyFull: "",
        replyBuffer: "",
        turn: 0,
        lastActivity: Date.now(),
        sessionId: "",
        connectedAt: Date.now(),
        rttMs: null,
        probedAt: null,
        health: "ok",
      };
      // The same id coming back within PARK_MS is the same seat: a reloaded
      // emulator tab or a reconnecting iPad keeps its profile, consent,
      // session and cabin state — no new consent, no new conversation.
      const parked = this.parked.get(deviceId);
      if (parked && role === "kiosk" && Date.now() - parked.parkedAt < PARK_MS) {
        const { parkedAt: _, ...state } = parked;
        Object.assign(entry, state);
        if (state.sessionId) this.sessionDevice.set(state.sessionId, deviceId);
        logger.log("seat.connect", { role, restored: true }, { deviceId, sessionId: state.sessionId || undefined });
      }
      this.parked.delete(deviceId);
      // Console cap: evict the oldest console(s) to make room for this one.
      if (entry.kind === "console") {
        const hosts = Array.from(this.devices).filter(([id, e]) => e.kind === "console" && id !== deviceId).sort((a, b) => a[1].connectedAt - b[1].connectedAt);
        for (const [id, e] of hosts.slice(0, Math.max(0, hosts.length - (MAX_HOST_CONSOLES - 1)))) {
          logger.log("host.action", { action: "evict", args: { evicted: id, max: MAX_HOST_CONSOLES } }, { deviceId });
          e.socket.emit("host:evicted", { max: MAX_HOST_CONSOLES, by: deviceId });
          e.socket.disconnect(true);
        }
      }
      this.devices.set(deviceId, entry);
      socket.data.deviceId = deviceId;
      // The same id coming back is the "lost" device returning — not a new one.
      this.lost.delete(deviceId);
      this.broadcastDevices();
      // First ping right away, so the console's row gets an RTT within a
      // second instead of waiting for the next 10 s tick.
      setTimeout(() => void this.probeDevices(), 500);
      // Snapshot current state to the freshly-connected client.
      socket.emit("face:emotion", { emotion: entry.emotion, since: this.now() });
      // Include the phase — a client reconnecting after a mid-turn drop must
      // not keep showing a stale "thinking" forever.
      socket.emit("pipeline:phase", { phase: entry.phase, sessionId: "" });
      socket.emit("persona:active", entry.persona);
      socket.emit("cabin:state", { controls: entry.controls });
      socket.emit("status:update", this.status);
      if (this.lastTelemetry) socket.emit("telemetry:update", this.lastTelemetry);
      // Host consoles need the authored persona set to populate their pickers.
      if (role === "host" && this.personaLister) {
        socket.emit("host:personas", { personas: this.personaLister() });
      }
      if (role === "host" && this.configLister) {
        socket.emit("host:config", this.configLister());
      }
      if (role === "host") {
        socket.on("host:probe", () => {
          logger.log("host.action", { action: "probe", args: {} }, { deviceId });
          void this.probeDevices();
        });
        socket.on("host:reset-device", ({ deviceId: target }) => {
          const e = this.devices.get(target);
          if (!e || target === deviceId) return;
          logger.log("host.action", { action: "reset-device", args: { target, kind: e.kind } }, { deviceId });
          this.parked.delete(target);
          if (e.role === "kiosk") {
            // Same path as "Sitz zurücksetzen": the seat returns to consent.
            this.io.emit("session:reset", { deviceId: target });
          } else {
            e.socket.emit("host:reload", { by: deviceId });
          }
        });
        socket.on("host:reset-all", () => {
          logger.log("host.action", { action: "reset-all", args: {} }, { deviceId });
          this.parked.clear();
          // Seats: back to the consent screen, like "Alle Sitze zurücksetzen".
          this.io.emit("session:reset", { deviceId: "*" });
          // Other consoles: reload yourselves (fresh state, stale tabs get a nudge).
          for (const [id, e] of this.devices) {
            if (e.role === "host" && id !== deviceId) e.socket.emit("host:reload", { by: deviceId });
          }
          this.lost.clear();
          this.broadcastDevices();
        });
      }
      // Hosts get the debug log: the buffer now, then live. A re-subscribe
      // (host:log:replay) swaps the sink so there is never a double stream.
      if (role === "host") {
        entry.unsubscribeLog = logger.subscribe((events, replay) =>
          socket.emit("host:log", { events, replay }),
        );
      }
      // Only seats are worth a log line — a host console connecting is the
      // observer, not the observed (and it would see its own refresh).
      if (role === "kiosk") logger.log("seat.connect", { role }, { deviceId });
      this.pushSeats();
    });
    socket.on("host:log:replay", ({ since }) => {
      const deviceId = (socket.data.deviceId as string | undefined) ?? "unknown";
      const entry = this.devices.get(deviceId);
      if (!entry || entry.role !== "host") return;
      entry.unsubscribeLog?.();
      entry.unsubscribeLog = logger.subscribe(
        (events, replay) => socket.emit("host:log", { events, replay }),
        since,
      );
    });

    // Visitor consent for recording (GDPR) — starts the visible session.
    socket.on("card:answer", ({ sessionId, cardId, value }) => {
      const deviceId = this.trackSession(socket, sessionId);
      const entry = this.devices.get(deviceId);
      if (!entry || !entry.card || entry.card.id !== cardId || !entry.card.local) return;
      entry.lastActivity = Date.now();
      entry.active = true;
      this.cardAnswerHandler?.({
        sessionId, deviceId, cardId, value: String(value),
        lang: entry.persona.accommodations.language,
        persona: this.personaOf(deviceId),
      });
    });

    socket.on("reply:repeat", ({ sessionId }) => {
      const deviceId = this.trackSession(socket, sessionId);
      const entry = this.devices.get(deviceId);
      if (!entry) return;
      entry.lastActivity = Date.now();
      this.repeatHandler?.({ sessionId, deviceId, lang: entry.persona.accommodations.language, persona: this.personaOf(deviceId) });
    });

    socket.on("consent:set", ({ sessionId, consent }) => {
      const deviceId = this.trackSession(socket, sessionId);
      this.countEvent("consent:set", deviceId);
      this.consentBySession.set(sessionId, consent);
      logger.log("consent", { consent }, { deviceId, sessionId });
      const entry = this.devices.get(deviceId);
      if (entry) {
        entry.consent = consent;
        entry.active = true;
        entry.lastActivity = Date.now();
        // A visitor arrived — a sleeping face wakes up.
        if (entry.emotion === "sleeping") this.emitEmotion(entry, "neutral");
      }
      this.pushSeats();
    });

    // Text or browser-transcribed message → hand to the agent.
    socket.on("chat:send", ({ sessionId, text, lang, modality }) => {
      const deviceId = this.trackSession(socket, sessionId);
      this.countEvent("chat:send", deviceId, text);
      if (!this.allowTurn(deviceId)) return;
      const entry = this.devices.get(deviceId);
      if (entry) {
        entry.lastUser = text.slice(0, SNIPPET_MAX);
        entry.active = true;
        entry.lastActivity = Date.now();
      }
      this.pushSeats();
      this.chatHandler?.({
        sessionId, deviceId, text, lang,
        persona: this.personaOf(deviceId),
        modality: modality ?? "text",
        consent: this.consentBySession.get(sessionId) ?? false,
      });
    });

    // Push-to-talk → barge-in: abort any running turn for this seat, then
    // reflect listening on this device's Face/phase.
    socket.on("ptt:start", ({ sessionId }) => {
      const deviceId = this.trackSession(socket, sessionId);
      this.countEvent("ptt:start", deviceId);
      const entry = this.devices.get(deviceId);
      if (entry) {
        entry.active = true;
        entry.lastActivity = Date.now();
      }
      this.interruptHandler?.({ deviceId, sessionId });
      this.emitPhase("listening", sessionId);
      this.setEmotion("listening", sessionId);
    });
    socket.on("ptt:stop", ({ sessionId }) => {
      this.emitPhase("idle", sessionId);
    });

    // Recorded utterance → server-side STT pipeline.
    socket.on("voice:utterance", ({ sessionId, audioBase64, mime, lang }) => {
      const deviceId = this.trackSession(socket, sessionId);
      this.countEvent("voice:utterance", deviceId);
      if (!this.allowTurn(deviceId)) return;
      const e = this.devices.get(deviceId);
      if (e) e.lastActivity = Date.now();
      this.voiceHandler?.({
        sessionId, deviceId, audioBase64, mime, lang,
        persona: this.personaOf(deviceId),
        consent: this.consentBySession.get(sessionId) ?? false,
      });
    });

    // The seat tried to drive the cabin controller and is telling us how it
    // went. A failure marks the control degraded (last-known intent stays on
    // screen) instead of silently pretending the light changed.
    socket.on("cabin:actuate:result", ({ control, ok, error }) => {
      const deviceId = (socket.data.deviceId as string | undefined) ?? "unknown";
      this.countEvent("cabin:actuate:result", deviceId);
      const entry = this.devices.get(deviceId);
      const state = entry?.controls.find((c) => c.id === control);
      if (!entry || !state) return;
      logger.log(
        "cabin.result",
        { control, ok, ...(error ? { error } : {}) },
        { deviceId, sessionId: entry.sessionId, turn: entry.turn, level: ok ? "info" : "warn" },
      );
      state.degraded = !ok;
      if (!ok) {
        // eslint-disable-next-line no-console
        console.warn(`[hub] ${deviceId} could not actuate ${control}: ${error ?? "unknown"}`);
      }
      entry.socket.emit("cabin:state", { controls: entry.controls });
      this.pushSeats();
    });

    // NFC scan at this kiosk → persona/"account" resolution.
    socket.on("nfc:register", ({ sessionId, tagId, lang }) => {
      const deviceId = this.trackSession(socket, sessionId);
      this.countEvent("nfc:register", deviceId, tagId);
      this.nfcHandler?.({ sessionId, deviceId, tagId, lang });
    });

    // Host console actions.
    const hostAction = (action: string, args: Record<string, unknown>) =>
      logger.log("host.action", { action, args }, { deviceId: socket.data.deviceId as string | undefined });
    socket.on("host:setPersona", ({ persona, deviceId }) => {
      hostAction("setPersona", { persona, ...(deviceId ? { deviceId } : {}) });
      if (deviceId) this.setPersonaForDevice(deviceId, persona, "host");
      else this.setPersona(persona, "host");
    });
    socket.on("host:overrideLight", ({ deviceId, control, on }) => {
      hostAction("overrideLight", { deviceId, control, on });
      // Stale/foreign clients must never crash the hub — log and carry on.
      this.applyCabinControl(deviceId, control, { on }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[hub] host:overrideLight failed:", err);
      });
    });
    socket.on("host:resetSession", ({ deviceId }) => {
      hostAction("resetSession", { deviceId });
      if (deviceId === "*") this.parked.clear();
      else this.parked.delete(deviceId);
      this.io.emit("session:reset", { deviceId });
      const targets =
        deviceId === "*"
          ? [...this.devices.keys()]
          : [deviceId];
      for (const id of targets) {
        const entry = this.devices.get(id);
        if (!entry || entry.role !== "kiosk") continue;
        entry.active = false;
        entry.consent = false;
        entry.lastUser = "";
        entry.lastReply = "";
        entry.replyBuffer = "";
        entry.phase = "idle";
        // Next visitor starts fresh: default persona, sleeping attract face.
        this.clearDecay(id);
        this.emitEmotion(entry, "sleeping");
        this.setPersonaForDevice(id, "default", "host");
      }
      this.pushSeats();
    });
    socket.on("host:toggleOffline", ({ offline }) => {
      hostAction("toggleOffline", { offline });
      this.manualOffline = offline;
      this.recomputeStatus();
    });
    socket.on("host:patchTelemetry", (patch) => {
      hostAction("patchTelemetry", patch as Record<string, unknown>);
      this.telemetryPatchHandler?.(patch);
    });
    socket.on("host:inspect", ({ deviceId }) => {
      const result = this.inspectResolver?.(deviceId);
      if (result) socket.emit("host:inspect:result", result);
    });
    socket.on("host:recover", () => {
      hostAction("recover", {});
      this.io.emit("pipeline:phase", { phase: "idle", sessionId: "*" });
      this.io.emit("chat:delta", { sessionId: "*", text: "", done: true, turn: -1 });
      this.setEmotion("neutral");
    });

    socket.on("disconnect", () => {
      const id = socket.data.deviceId as string | undefined;
      if (id) {
        const e = this.devices.get(id);
        e?.unsubscribeLog?.();
        // The entry still knows which session was on the seat — log it, so a
        // drop mid-conversation is attributable in the Log tab.
        if (e?.role === "kiosk") {
          logger.log("seat.disconnect", { role: "kiosk" }, { deviceId: id, sessionId: e.sessionId || undefined });
        }
        this.clearDecay(id);
        this.turnBudget.delete(id);
        // Keep a "lost" line for 30 s so a flapping iPad is visible on the
        // console. Kiosks only: a console tab closing is not a fault.
        if (e && e.role === "kiosk") {
          this.parked.set(id, {
            persona: e.persona, emotion: e.emotion, consent: e.consent, active: e.active,
            sessionId: e.sessionId, lastUser: e.lastUser, lastReply: e.lastReply, lastReplyFull: e.lastReplyFull,
            controls: e.controls, turn: e.turn, lastActivity: e.lastActivity, parkedAt: Date.now(),
          });
          setTimeout(() => {
            const p = this.parked.get(id);
            if (p && Date.now() - p.parkedAt >= PARK_MS) this.parked.delete(id);
          }, PARK_MS + 1000);
          this.lost.set(id, { ...this.snapshot(id, e), health: "lost", rttMs: null });
          setTimeout(() => {
            this.lost.delete(id);
            this.broadcastDevices();
          }, LOST_LINGER_MS);
          if (e.health !== "lost") {
            logger.log("device.health", { health: "lost", rttMs: null, transport: transportOf(e.socket) }, { deviceId: id, level: "warn" });
          }
        }
        this.devices.delete(id);
      }
      this.broadcastDevices();
      this.pushSeats();
    });
  }

  /** Remember which device a session lives on (routes replies back to it). */
  private trackSession(socket: Sock, sessionId: string): string {
    const deviceId = (socket.data.deviceId as string | undefined) ?? "unknown";
    this.sessionDevice.set(sessionId, deviceId);
    const entry = this.devices.get(deviceId);
    if (entry) entry.sessionId = sessionId;
    return deviceId;
  }

  private personaOf(deviceId: string): PersonaKey {
    return this.devices.get(deviceId)?.persona.persona ?? "default";
  }

  private resolvePersona(key: PersonaKey): PersonaBroadcast {
    return this.personaResolver
      ? this.personaResolver(key)
      : { ...DEFAULT_PERSONA_BROADCAST, persona: key };
  }

  /** The device entry a session belongs to. */
  private entryOf(sessionId: string): DeviceEntry | undefined {
    const deviceId = this.sessionDevice.get(sessionId);
    return deviceId ? this.devices.get(deviceId) : undefined;
  }

  /** One device as the console sees it. */
  private snapshot(deviceId: string, d: DeviceEntry): ConnectedDevice {
    return {
      deviceId,
      role: d.role,
      kind: d.kind,
      connectedAt: new Date(d.connectedAt).toISOString(),
      transport: transportOf(d.socket),
      lastActivityAt: d.role === "kiosk" ? new Date(d.lastActivity).toISOString() : null,
      active: d.active,
      rttMs: d.rttMs,
      probedAt: d.probedAt ? new Date(d.probedAt).toISOString() : null,
      health: d.health,
    };
  }

  private broadcastDevices(): void {
    const devices: ConnectedDevice[] = [
      ...Array.from(this.devices, ([deviceId, d]) => this.snapshot(deviceId, d)),
      ...this.lost.values(),
    ];
    this.io.emit("devices:update", { devices });
  }

  /**
   * The link check: ping every socket with an ack timeout and classify the
   * answer. Runs every PROBE_INTERVAL_MS and on `host:probe`; broadcasts
   * only when a device's facts changed, logs only on health transitions.
   */
  async probeDevices(): Promise<void> {
    const before = JSON.stringify(Array.from(this.devices, ([id, d]) => this.snapshot(id, d)));
    await Promise.all(
      Array.from(this.devices, ([id, d]) => {
        const started = Date.now();
        return new Promise<void>((resolve) => {
          d.socket.timeout(PROBE_TIMEOUT_MS).emit("sys:ping", (err: Error | null) => {
            // The entry may have disconnected meanwhile.
            if (this.devices.get(id) !== d) return resolve();
            const rtt = err ? null : Date.now() - started;
            const health: DeviceHealth = err ? "stale" : rtt! > SLOW_RTT_MS ? "slow" : "ok";
            d.rttMs = rtt;
            d.probedAt = Date.now();
            if (health !== d.health) {
              d.health = health;
              logger.log(
                "device.health",
                { health, rttMs: rtt, transport: transportOf(d.socket) },
                { deviceId: id, level: health === "ok" ? "info" : "warn" },
              );
            }
            resolve();
          });
        });
      }),
    );
    const after = JSON.stringify(Array.from(this.devices, ([id, d]) => this.snapshot(id, d)));
    if (after !== before) this.broadcastDevices();
  }

  /** Push per-seat summaries to every connected host console. */
  private pushSeats(): void {
    const seats: SeatSummary[] = [];
    for (const [deviceId, e] of this.devices) {
      if (e.role !== "kiosk") continue;
      seats.push({
        deviceId,
        persona: e.persona.persona,
        personaLabel: e.persona.label,
        accommodations: e.persona.accommodations,
        memories: this.memoriesResolver?.(e.persona.persona) ?? [],
        emotion: e.emotion,
        phase: e.phase,
        consent: e.consent,
        active: e.active,
        lastUser: e.lastUser,
        lastReply: e.lastReply,
        controls: e.controls,
      });
    }
    for (const e of this.devices.values()) {
      if (e.role === "host") e.socket.emit("host:seats", { seats });
    }
  }

  /** Register how host telemetry overrides are applied (into the journey
   *  simulation, which owns the state — not onto a stale snapshot). */
  onTelemetryPatch(handler: (patch: HostTelemetryPatch) => void): void {
    this.telemetryPatchHandler = handler;
  }

  // ── Per-seat conversation events ────────────────────────────────

  /**
   * Set the Face for a session's device; without a session, for every kiosk.
   * Expressive emotions (happy/sad/surprised) are reactions, not states: a
   * per-seat timer settles the face back to neutral after a few seconds.
   * Any newer emotion cancels the pending decay.
   */
  setEmotion(emotion: FaceEmotion, sessionId?: string, turn?: number): void {
    const known = sessionId ? this.entryOf(sessionId) : undefined;
    // A superseded (barged-in) turn may still race in — drop its stale emotion
    // like emitChatDelta drops its text. Callers without a turn stay unguarded.
    if (known && turn !== undefined && turn !== -1 && turn < known.turn) return;
    const targets: [string, DeviceEntry][] = known
      ? [[this.sessionDevice.get(sessionId!)!, known]]
      : [...this.devices].filter(([, e]) => e.role === "kiosk");
    for (const [deviceId, entry] of targets) {
      this.clearDecay(deviceId);
      entry.lastActivity = Date.now();
      this.emitEmotion(entry, emotion);
      if (DECAYING_EMOTIONS.has(emotion)) {
        const t = setTimeout(() => {
          this.decayTimers.delete(deviceId);
          this.emitEmotion(entry, "neutral");
          this.pushSeats();
        }, config.face.emotionDecayMs);
        t.unref?.();
        this.decayTimers.set(deviceId, t);
      }
    }
    this.pushSeats();
  }

  /** Switch every kiosk's persona (host console "all seats" action). */
  setPersona(persona: PersonaKey, by: "nfc" | "host" | "boot" = "boot"): void {
    for (const [deviceId, entry] of this.devices) {
      if (entry.role === "kiosk") this.setPersonaForDevice(deviceId, persona, by);
    }
  }

  /** Switch one kiosk's persona (NFC "account" registration / host). */
  setPersonaForDevice(deviceId: string, persona: PersonaKey, by: "nfc" | "host" | "boot" = "host"): void {
    const entry = this.devices.get(deviceId);
    if (entry && entry.persona.persona !== persona) {
      logger.log("persona.switch", { persona, by }, { deviceId, sessionId: entry.sessionId });
    }
    if (!entry) return;
    entry.persona = this.resolvePersona(persona);
    entry.socket.emit("persona:active", entry.persona);
    this.pushSeats();
  }

  /** The active profile key for a seat (for the agent's profile tools). */
  seatPersonaKey(deviceId: string): PersonaKey {
    return this.personaOf(deviceId);
  }

  /**
   * Begin a new turn on a seat: bumps the seat's monotonic turn number. All
   * events of the turn carry it; clients drop chunks from superseded turns
   * (barge-in) and reset their reply view when a higher number appears.
   * Unknown seat → -1 (wildcard: clients accept it unconditionally).
   */
  /** The seat's current turn number (-1 for an unknown session). */
  currentTurn(sessionId: string): number {
    return this.entryOf(sessionId)?.turn ?? -1;
  }

  beginTurn(sessionId: string): number {
    const entry = this.entryOf(sessionId);
    if (!entry) return -1;
    entry.turn += 1;
    return entry.turn;
  }

  /**
   * Merge an accommodation change into a seat (agent `set_presentation`) and
   * re-broadcast the active profile so the client re-renders. Returns the
   * resulting accommodations. Session-scoped — durable write-back (card-bound
   * riders only) is the caller's job.
   */
  patchSeatAccommodations(
    deviceId: string,
    patch: Partial<Accommodations>,
  ): Accommodations | undefined {
    const entry = this.devices.get(deviceId);
    if (!entry) return undefined;
    const accommodations = { ...entry.persona.accommodations, ...patch };
    entry.persona = { ...entry.persona, accommodations };
    entry.socket.emit("persona:active", entry.persona);
    this.pushSeats();
    return accommodations;
  }

  /** Show (or clear) a seat's option card. Stale turns are dropped like
   *  chat deltas — a barged-in turn's card must not stomp the live one. */
  showCard(sessionId: string, card: SeatCard | null, turn: number): void {
    const entry = this.entryOf(sessionId);
    if (!entry) return;
    if (turn !== -1 && turn < entry.turn) return;
    if (entry.cardTimer) clearTimeout(entry.cardTimer);
    entry.cardTimer = undefined;
    if (!card && !entry.card) return; // nothing to clear — keep the wire quiet
    entry.card = card ?? undefined;
    if (!card) entry.wizardStep = undefined;
    entry.socket.emit("seat:card", { sessionId, card, turn });
    if (card) {
      // auto-dismiss: a forgotten question must not stick in the slit
      entry.cardTimer = setTimeout(() => {
        if (entry.card?.id === card.id) this.showCard(sessionId, null, -1);
      }, card.ttlMs);
      entry.cardTimer.unref?.();
      logger.log(
        "card.show",
        {
          kind: card.kind, question: card.question, options: card.options.map((o) => o.label),
          local: card.local, ...(card.step ? { step: `${card.step.index + 1}/${card.step.total}` } : {}),
        },
        { sessionId, turn },
      );
    }
  }

  /** The card currently shown at a seat, if any. */
  cardOf(sessionId: string): SeatCard | undefined {
    return this.entryOf(sessionId)?.card;
  }

  wizardStepOf(sessionId: string): number | undefined {
    return this.entryOf(sessionId)?.wizardStep;
  }

  setWizardStep(sessionId: string, step: number | undefined): void {
    const entry = this.entryOf(sessionId);
    if (entry) entry.wizardStep = step;
  }

  /** The seat's last complete reply (for ↻). */
  lastReplyOf(sessionId: string): string {
    return this.entryOf(sessionId)?.lastReplyFull ?? "";
  }

  /** The seat's LIVE accommodations (what the rider sees/hears right now).
   *  This — not the profile — is the truth for a running session: a walk-up's
   *  set_presentation changes live only here. */
  accommodationsOf(sessionId: string): Accommodations | undefined {
    return this.entryOf(sessionId)?.persona.accommodations;
  }

  /** Conversation phase → drives the thinking UI and mechanical Face emotion. */
  emitPhase(phase: PipelinePhase, sessionId: string, turn?: number): void {
    const entry = this.entryOf(sessionId);
    // Same staleness rule as emitChatDelta: a phase from a superseded turn
    // must never stomp the seat (e.g. a zombie "thinking" after the live
    // turn already settled to idle).
    if (entry && turn !== undefined && turn !== -1 && turn < entry.turn) return;
    if (entry) {
      entry.phase = phase;
      entry.socket.emit("pipeline:phase", { phase, sessionId });
    } else {
      this.io.emit("pipeline:phase", { phase, sessionId });
    }
    this.pushSeats();
  }

  /** Stream a chunk of CoSiMo's reply text to the session's device. */
  emitChatDelta(sessionId: string, text: string, done: boolean, turn: number): void {
    const entry = this.entryOf(sessionId);
    if (!entry) {
      this.io.emit("chat:delta", { sessionId, text, done, turn });
      return;
    }
    // Drop chunks from a superseded turn — a barged-in stream may still race in.
    if (turn !== -1 && turn < entry.turn) return;
    entry.socket.emit("chat:delta", { sessionId, text, done, turn });
    if (done) {
      if (entry.replyBuffer) {
        entry.lastReply = entry.replyBuffer.slice(0, SNIPPET_MAX);
        entry.lastReplyFull = entry.replyBuffer;
      }
      entry.replyBuffer = "";
      this.pushSeats();
    } else {
      entry.replyBuffer += text;
    }
  }

  /** Echo what CoSiMo heard from a voice utterance (server STT). */
  emitTranscript(sessionId: string, text: string, lang: Locale): void {
    const entry = this.entryOf(sessionId);
    if (entry) {
      entry.lastUser = text.slice(0, SNIPPET_MAX);
      entry.socket.emit("voice:transcript", { sessionId, text, lang });
      this.pushSeats();
    } else {
      this.io.emit("voice:transcript", { sessionId, text, lang });
    }
  }

  /** Send one streamed speech clip (or the end marker) to the session's
   *  device. Stale-turn chunks are dropped like chat deltas. */
  emitTtsChunk(sessionId: string, chunk: Omit<TtsChunk, "sessionId">): void {
    const entry = this.entryOf(sessionId);
    if (entry && chunk.turn !== -1 && chunk.turn < entry.turn) return;
    // Not `(socket ?? io).emit`: the two emit signatures diverge once an
    // event with an ack (sys:ping) exists, and the union isn't callable.
    if (entry) entry.socket.emit("tts:chunk", { sessionId, ...chunk });
    else this.io.emit("tts:chunk", { sessionId, ...chunk });
  }

  // ── Global showcase state ─────────────────────────────────────────

  setStatus(patch: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...patch };
    this.io.emit("status:update", this.status);
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

  /** Payload answered its probe. Informational — nothing degrades here
   *  (providers already fall back to built-ins on their own). */
  setCmsReachable(ok: boolean): void {
    if (ok === this.status.cms) return;
    this.setStatus({ cms: ok });
    logger.log("service.status", { cms: ok }, { level: ok ? "info" : "warn" });
  }

  /** The brain answered its probe (primary, or the fallback standing in). */
  setLlmReachable(ok: boolean): void {
    if (ok === this.llmReachable) return;
    this.llmReachable = ok;
    this.recomputeStatus();
  }

  /** True when CoSiMo should serve scripted canned replies instead of the LLM. */
  isOfflineMode(): boolean {
    return this.status.offlineCanned;
  }

  /** Derive llm/network/offlineCanned from the inputs and broadcast once. */
  private recomputeStatus(): void {
    const llm = this.llmConfigured && this.networkOk && this.llmReachable;
    const offlineCanned = this.manualOffline || !this.networkOk || !this.llmReachable;
    const changed = llm !== this.status.llm || offlineCanned !== this.status.offlineCanned;
    this.setStatus({ network: this.networkOk, llm, offlineCanned });
    if (changed) {
      logger.log(
        "service.status",
        { llm, network: this.networkOk, offlineCanned },
        { level: llm ? "info" : "warn" },
      );
    }
  }

  /** Broadcast a telemetry snapshot to the on-screen displays (and cache it). */
  emitTelemetry(telemetry: MonoCabTelemetry): void {
    this.lastTelemetry = telemetry;
    this.io.emit("telemetry:update", telemetry);
  }

  /**
   * Apply a cabin-control change for ONE SEAT and notify that seat + hosts.
   * Cabin controls are per seat (reading lamp etc.). The `real` control is
   * driven through the hardware LightDriver — currently a single relay, so
   * physically it's one light regardless of seat; the per-seat state still
   * tracks who asked for it. If the device is unreachable we mark the control
   * `degraded` and keep showing last-known intent — the demo never breaks.
   */
  async applyCabinControl(
    deviceId: string | undefined,
    control: CabinControlId,
    change: { on?: boolean; level?: number },
  ): Promise<CabinControlState> {
    const device = deviceId ? this.devices.get(deviceId) : undefined;
    if (!device) throw new Error(`unknown device: ${String(deviceId)}`);
    const entry = device.controls.find((c) => c.id === control);
    if (!entry) throw new Error(`unknown cabin control: ${control}`);
    const def = CABIN_CONTROLS.find((c) => c.id === control);

    if (def?.real && change.on !== undefined && this.lightDriver) {
      try {
        await this.lightDriver.setOn(change.on);
        entry.degraded = false;
        if (!this.status.light) this.setStatus({ light: true });
      } catch (err) {
        entry.degraded = true;
        this.setStatus({ light: false });
        // eslint-disable-next-line no-console
        console.error(`[hub] light driver failed for ${control}:`, err);
      }
    }

    if (change.on !== undefined) entry.on = change.on;
    if (change.level !== undefined) entry.level = change.level;
    device.socket.emit("cabin:state", { controls: device.controls });
    // Hand the physical change to the seat: the cabin LAN is air-gapped, so
    // the dual-homed iPad is the only thing that can reach the controller.
    // Fire-and-forget — the seat answers with cabin:actuate:result, and the
    // demo carries on regardless (state is already broadcast above).
    const actuation = this.lpu2Config
      ? buildActuation(control, change, this.lpu2Config())
      : null;
    if (actuation && device.role === "kiosk") {
      logger.log(
        "cabin.actuate",
        { control, urls: actuation.urls, change: { ...change } },
        { deviceId, sessionId: device.sessionId, turn: device.turn },
      );
      device.socket.emit("cabin:actuate", actuation);
    }
    this.pushSeats();
    return entry;
  }

  get connectedDevices(): number {
    return this.devices.size;
  }

  /** Seats with a visitor session in progress — the real passengers. */
  get activeSeats(): number {
    let n = 0;
    for (const e of this.devices.values()) if (e.role === "kiosk" && e.active) n++;
    return n;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
