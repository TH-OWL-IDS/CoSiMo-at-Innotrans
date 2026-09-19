"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  CabinControlId,
  CabinActuation,
  CabinActuationResult,
  CabinControlState,
  ClientToServerEvents,
  ConnectedDevice,
  ConnectionStatus,
  LogEvent,
  FaceEmotion,
  HostTelemetryPatch,
  Locale,
  Modality,
  MonoCabTelemetry,
  PersonaBroadcast,
  PersonaKey,
  PipelinePhase,
  SeatInspection,
  SeatSummary,
  ServerToClientEvents,
  SeatCard,
  SeatSettingsOpen,
  Accommodations,
  HostConfigBroadcast,
  HostRigAction,
  HostRigState,
  CabinLightState,
  LightSetRequest,
  SceneSaveRequest,
  LlmTestResult,
  SpeechTestResult,
  ClientKind,
  ServiceInfo,
} from "@cosimo/shared";

type CosimoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const sessionKey = (role: string) => `cosimo.sessionId.${role}`;
function storedSession(role: string): string | null {
  try {
    return sessionStorage.getItem(sessionKey(role));
  } catch {
    return null;
  }
}
/** Take over a hub-issued session id (remembered like our own). */
function adoptSession(role: string, id: string): string {
  try {
    sessionStorage.setItem(sessionKey(role), id);
  } catch {
    // private mode — fine
  }
  return id;
}

/** A fresh session id, remembered for this tab. */
function newSession(role: string): string {
  const id = makeId("s");
  try {
    sessionStorage.setItem(sessionKey(role), id);
  } catch {
    // private mode — the id just won't survive a reload
  }
  return id;
}

/** Id prefix per client kind: seats (real or emulated) are "cosi-", operator
 *  consoles "host-", journey views "journey-". */
const ID_PREFIX: Record<ClientKind, string> = { kiosk: "cosi", emulator: "cosi", console: "host", journey: "journey" };

/** A per-tab device id that survives reloads (falls back to a fresh one).
 *  A stored id with the wrong prefix (older build) is replaced. */
function stableDeviceId(kind: ClientKind): string {
  const key = `cosimo.deviceId.${kind}`;
  const prefix = ID_PREFIX[kind];
  try {
    const kept = sessionStorage.getItem(key);
    if (kept && kept.startsWith(`${prefix}-`)) return kept;
    const id = makeId(prefix);
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return makeId(prefix);
  }
}

export interface CosimoState {
  connected: boolean;
  /** This client's own device id, as the hub lists it. */
  deviceId: string;
  emotion: FaceEmotion;
  phase: PipelinePhase;
  /** The streaming reply text for the current/last CoSiMo turn. */
  reply: string;
  /** CoSiMo's option/info card for this seat (null = none). */
  card: SeatCard | null;
  /** Dismiss the card locally (e.g. after a tap already sent the answer). */
  clearCard: () => void;
  /** The rider's settings menu, while CoSiMo has it open (null = closed). */
  settings: SeatSettingsOpen | null;
  /** Close the menu locally (back button, idle timeout). */
  closeSettings: () => void;
  /** One change from the menu: the hub applies it (no LLM round) and, with
   *  `speak`, confirms aloud in the new setting. */
  patchSettings: (patch: Partial<Accommodations>, speak: boolean, reset?: boolean) => void;
  /** ↻ — have CoSiMo say the last reply again. */
  repeatLast: () => void;
  /** When the last reply finished (ms epoch) — drives the ↻ affordance. */
  lastReplyAt: number;
  /** The sentence CoSiMo is speaking right now (server TTS); stays after the reply. */
  caption: string;
  /** Last rider activity at this seat (ms epoch) — drives the idle hint. */
  lastActivityAt: number;
  /** True while CoSiMo's reply is still streaming. */
  replying: boolean;
  /** Running conversation history (rider + CoSiMo), for the text-first layout. */
  transcript: { role: "user" | "cosimo"; text: string }[];
  telemetry: MonoCabTelemetry | null;
  status: ConnectionStatus | null;
  /** Live cabin-control state for THIS seat (cabin-scoped controls merged
   *  in by the hub), kept in sync across all iPads. */
  cabin: CabinControlState[];
  /** The shared cabin-scoped control state (host consoles, via host:seats). */
  hostCabin: CabinControlState[];
  /** The console's rig page: every fixture's state + last outcomes (hub-held). */
  rig: HostRigState | null;
  /** One rig-page action (on/off/levels/mode) with the state the operator set. */
  hostRig: (a: HostRigAction) => void;
  /** THE cabin light: scene + the three groups + the scene list (hub-held, everyone sees it). */
  light: CabinLightState | null;
  /** A scene step or one group — from the panel button, the slit menu or the console. */
  setLight: (req: LightSetRequest) => void;
  /** Console: write the cabin's current levels into a scene (CMS). */
  saveScene: (req: SceneSaveRequest) => void;
  /** The structured debug log (host consoles): replayed buffer + live tail,
   *  oldest first, capped client-side. See @cosimo/shared log.ts. */
  logs: LogEvent[];
  clearLogs: () => void;
  /** Ask the hub to resend its buffer (e.g. after a reconnect). */
  replayLogs: (since?: number) => void;
  /**
   * Register how this client performs a cabin actuation on the cabin LAN.
   * Only the kiosks can — they are the dual-homed devices — so the host
   * console never registers one and the hub simply hears nothing back.
   * The result is reported to the hub automatically.
   */
  setCabinActuator: (
    perform: ((actuation: CabinActuation) => Promise<CabinActuationResult>) | null,
  ) => void;
  /** The active persona (theme + presentation), or null before first sync. */
  persona: PersonaBroadcast | null;
  /** Emotion to render on the Face — "speaking" while audio plays, else the
   *  server's emotion. Keeps the moving mouth in sync with the actual voice. */
  faceEmotion: FaceEmotion;
  /** True while CoSiMo's voice is actually playing. */
  speaking: boolean;
  /** Signal that locally-generated speech (browser TTS) started/stopped. */
  setSpeaking: (on: boolean) => void;
  /**
   * Live mouth drive from the actually-playing TTS clip: `open` is the
   * smoothed loudness envelope (0..1), `tilt` the spectral brightness (0..1,
   * bright "iii" vs dark "ooo"). Null when nothing analysable is playing
   * (e.g. browser-TTS fallback) — the face then uses its synthetic cadence.
   * A getter, not state: the face samples it inside its own animation frame.
   */
  getMouthDrive: () => { open: number; tilt: number } | null;
  /** Last thing CoSiMo heard via server STT (for display). */
  heard: string;
  /** Send a message to CoSiMo (text or browser-transcribed voice). */
  send: (text: string, lang: Locale, modality?: Modality) => void;
  /** Switch persona — all seats, or one seat when deviceId is given (host action). */
  setPersona: (key: PersonaKey, deviceId?: string) => void;
  /** Record the visitor's GDPR consent decision for this session. */
  setConsent: (consent: boolean) => void;
  /** Connected devices (operator console). */
  devices: ConnectedDevice[];
  /** Per-seat live summaries (operator console; empty for kiosks). */
  seats: SeatSummary[];
  /** The authored persona set (operator console; drives the persona pickers). */
  personas: PersonaBroadcast[];
  /** The hub's resolved operator routing (operator console), null until pushed. */
  hostConfig: HostConfigBroadcast | null;
  /** Console "Testen": last result, or "pending" while a test runs. */
  llmTest: LlmTestResult | "pending" | null;
  testLlm: () => void;
  hostLight: (key: string, on?: boolean) => void;
  cabinLight: (key: string, on?: boolean) => void;
  ttsTest: SpeechTestResult | "pending" | null;
  /** Optional catalog voice key; omitted = default voice. */
  testTts: (voice?: string) => void;
  sttTest: SpeechTestResult | "pending" | null;
  testStt: () => void;
  /** The deployables and their reachability (operator console). */
  services: ServiceInfo[];
  /** Deep view of one seat (host inspector), latest host:inspect result. */
  inspection: SeatInspection | null;
  /** Request a seat's deep view (system prompt + turns). */
  inspectSeat: (deviceId: string) => void;
  /** Run the hub's link check on every device now (operator console). */
  probeDevices: () => void;
  /** Reset everything: seats to consent, other consoles reload (operator console). */
  resetAll: () => void;
  /** Reset one device: seat → consent screen, journey/console → reload panel (operator console). */
  resetDevice: (deviceId: string) => void;
  /** Another console reset everything — this page should reload. */
  reloadRequired: boolean;
  /** This console was evicted (too many consoles); null = not evicted. */
  evicted: { max: number } | null;
  /** The hub refused this console's token — lock the page again. */
  unauthorized: boolean;
  /** Restart a deployable's container (operator console; prod only). */
  restartService: (id: ServiceInfo["id"]) => void;
  /** Last restart outcome, keyed by service id. */
  restartResults: Partial<Record<ServiceInfo["id"], { ok: boolean; error?: string; at: number }>>;
  clearInspection: () => void;
  /** The last hub-driven session start: `consent` is a stored decision (card
   *  rider → no consent screen) or null (ask again). */
  lastReset: { nonce: number; consent: boolean | null } | null;
  /** Someone is at this seat; false = the circle shows the check-in. */
  checkedIn: boolean;
  /** The guest chip on the check-in: continue without a card. */
  checkIn: () => void;
  /** Bumps when this device is reset by the host (re-show the welcome). */
  resetNonce: number;
  /** Host actions. */
  overrideLight: (deviceId: string, control: CabinControlId, on: boolean) => void;
  /** The generic flavour: level / scene / flash for the new control kinds. */
  setCabinControl: (deviceId: string, control: CabinControlId, change: { on?: boolean; level?: number; scene?: string; flash?: true }) => void;
  patchTelemetry: (patch: HostTelemetryPatch) => void;
  toggleOffline: (offline: boolean) => void;
  recover: () => void;
  resetSession: (deviceId: string) => void;
  /** Push-to-talk lifecycle (drives the listening Face). */
  pttStart: () => void;
  pttStop: () => void;
  /** Upload a recorded utterance for server STT. */
  sendUtterance: (audioBase64: string, mime: string, lang: Locale) => void;
  /** Report a scanned NFC chip (persona "account" registration). */
  registerNfc: (tagId: string, lang: Locale) => void;
  /** Stable session id for this kiosk visit. */
  sessionId: string;
}

/** A stable session id for this kiosk tab/visit. */
function makeId(prefix: string): string {
  const rnd = Math.floor(Math.random() * 1e9).toString(36);
  return `${prefix}-${rnd}`;
}

/** Client-side cap on buffered log events (the hub keeps its own). */
const LOG_MAX = 10_000;

/**
 * Connects the kiosk PWA to the realtime service and exposes CoSiMo's live
 * state: the Face emotion, conversation phase, streaming reply, telemetry, and
 * a `send` for the text fallback. The Face component renders `emotion`.
 */
export function useCosimoSocket(
  realtimeUrl: string,
  role: "kiosk" | "host" = "kiosk",
  /** What this client is, for the console's device list (defaults by role). */
  kind: ClientKind = role === "host" ? "console" : "kiosk",
  /** Consoles: the operator password's SHA-256 — the hub's HOST_TOKEN check. */
  token?: string,
  /** Kiosks: physical seat position 1-4 (operator setting) — picks the
   *  reading-lamp playback on the hub. */
  seat?: number,
  /** Kiosks: silent showcase mode (operator setting) — the hub shows it, nothing else changes. */
  /* (see below) */
  showcase?: boolean,
  /** Kiosks: check the seat out after 2 min of silence (default true; an iPad carried around turns it off). */
  autoCheckout = true,
): CosimoState {
  const sockRef = useRef<CosimoSocket | null>(null);
  // Stable across reloads of this tab, unique per tab: sessionStorage. A
  // fresh id per reload made every reload look like a new device on the
  // console; a localStorage id would collide across two open tabs (the hub
  // keys entries by id, so the second tab's disconnect would drop the first).
  const deviceId = useMemo(() => stableDeviceId(kind), [kind]);
  // The session id survives a reload of this tab (sessionStorage, like the
  // device id): the hub's recorder and the agent's history are keyed by it,
  // so a reloaded seat continues its conversation instead of starting one.
  const sessionRef = useRef<string>(storedSession(role) ?? newSession(role));

  /** Set by the kiosk (see setCabinActuator) — the host console leaves it null. */
  const actuatorRef = useRef<
    ((actuation: CabinActuation) => Promise<CabinActuationResult>) | null
  >(null);

  const [connected, setConnected] = useState(false);
  const [emotion, setEmotion] = useState<FaceEmotion>("sleeping");
  const [phase, setPhase] = useState<PipelinePhase>("idle");
  const [reply, setReply] = useState("");
  const replyRef = useRef("");
  const [replying, setReplying] = useState(false);
  const [transcript, setTranscript] = useState<CosimoState["transcript"]>([]);
  const [telemetry, setTelemetry] = useState<MonoCabTelemetry | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [cabin, setCabin] = useState<CabinControlState[]>([]);
  const [persona, setPersonaState] = useState<PersonaBroadcast | null>(null);
  /** CoSiMo's option/info card for this seat (null = none). */
  const [card, setCard] = useState<SeatCard | null>(null);
  const [settings, setSettings] = useState<SeatSettingsOpen | null>(null);
  const [lastReset, setLastReset] = useState<{ nonce: number; consent: boolean | null } | null>(null);
  /** Someone is at this seat (card, guest chip, or first input); false = the circle shows the check-in. */
  const [checkedIn, setCheckedIn] = useState(false);
  const [lastReplyAt, setLastReplyAt] = useState(0);
  /** The sentence being spoken right now (server TTS, per clip) — the slit's subtitle. */
  const [caption, setCaption] = useState("");
  const [lastActivityAt, setLastActivityAt] = useState(() => Date.now());
  const touch = () => setLastActivityAt(Date.now());
  /** Live playback volume for TTS clips — a ref, because the tts:chunk
   *  handler lives inside the socket-setup effect and must not go stale. */
  const volumeRef = useRef(1);
  const [heard, setHeard] = useState("");
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [seats, setSeats] = useState<SeatSummary[]>([]);
  const [hostCabin, setHostCabin] = useState<CabinControlState[]>([]);
  const [rig, setRig] = useState<HostRigState | null>(null);
  const [light, setLightState] = useState<CabinLightState | null>(null);
  const [personas, setPersonas] = useState<PersonaBroadcast[]>([]);
  const [hostConfig, setHostConfig] = useState<HostConfigBroadcast | null>(null);
  const [llmTest, setLlmTest] = useState<LlmTestResult | "pending" | null>(null);
  const [ttsTest, setTtsTest] = useState<SpeechTestResult | "pending" | null>(null);
  const [sttTest, setSttTest] = useState<SpeechTestResult | "pending" | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [evicted, setEvicted] = useState<{ max: number } | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [restartResults, setRestartResults] = useState<CosimoState["restartResults"]>({});
  const [inspection, setInspection] = useState<SeatInspection | null>(null);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [resetNonce, setResetNonce] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Highest turn number seen — chunks/clips from lower (barged-in) turns are dropped. */
  const turnRef = useRef(0);

  // Mouth drive: the playing TTS clip is routed through a Web Audio analyser
  // so the face's mouth can follow the actual voice (loudness + brightness)
  // instead of a synthetic cadence. Browser-TTS has no stream → no analyser.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  /** Playback gain — the volume authority for routed clips. iOS ignores
   *  HTMLMediaElement.volume (hardware-buttons only), a GainNode it honours. */
  const gainRef = useRef<GainNode | null>(null);
  const timeBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const freqBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  /** True while the current clip is wired into the analyser. */
  const analysingRef = useRef(false);
  /** Attack/release-smoothed envelope, kept across getter calls. */
  const envelopeRef = useRef(0);

  /** Create/resume the AudioContext. Call from user-gesture paths — WKWebView
   *  keeps a context suspended until a gesture unlocks it. */
  const ensureAnalyser = (): AnalyserNode | null => {
    if (typeof window === "undefined") return null;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtxRef.current) {
      const ctx = new AC();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.4;
      const gain = ctx.createGain();
      gain.gain.value = volumeRef.current;
      an.connect(gain);
      gain.connect(ctx.destination);
      gainRef.current = gain;
      audioCtxRef.current = ctx;
      analyserRef.current = an;
      timeBufRef.current = new Uint8Array(an.fftSize);
      freqBufRef.current = new Uint8Array(an.frequencyBinCount);
    }
    if (audioCtxRef.current.state !== "running") void audioCtxRef.current.resume();
    return analyserRef.current;
  };

  /**
   * Streaming TTS: the hub ships one clip per sentence (`tts:chunk`, numbered
   * per turn). Clips queue here and play back-to-back in order; `speaking`
   * stays up across the gaps and settles only after the end marker's last
   * clip has played (with a short grace so the mouth doesn't flicker).
   */
  const ttsQueueRef = useRef<{
    turn: number;
    next: number;
    pending: Map<number, { audioBase64: string; mime: string; text?: string }>;
    ended: boolean;
    playing: boolean;
  }>({ turn: -2, next: 0, pending: new Map(), ended: false, playing: false });
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settleSpeaking = () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setSpeaking(false);
    }, 120);
  };

  const playNextChunk = () => {
    const q = ttsQueueRef.current;
    if (q.playing) return;
    const clip = q.pending.get(q.next);
    if (!clip) {
      if (q.ended) settleSpeaking();
      return;
    }
    q.pending.delete(q.next);
    q.next++;
    q.playing = true;
    if (clip.text) setCaption(clip.text);
    if (settleTimerRef.current) { clearTimeout(settleTimerRef.current); settleTimerRef.current = null; }
    const onDone = () => {
      analysingRef.current = false;
      q.playing = false;
      playNextChunk();
    };
    try {
      const audio = new Audio(`data:${clip.mime};base64,${clip.audioBase64}`);
      audio.volume = volumeRef.current; // "leiser bitte" — playback-side, instant
      audioRef.current = audio;
      // Route the clip through the analyser (mouth sync) and the gain node —
      // on iOS the gain node is the ONLY working volume control, the element's
      // `volume` is silently ignored. `resume()` is async, so give a just-
      // unlocked context a beat to reach "running" before deciding; otherwise
      // the first clip after boot plays unrouted at full volume on the iPad.
      void (async () => {
        try {
          const an = ensureAnalyser();
          const ctx = audioCtxRef.current;
          if (an && ctx && ctx.state !== "running") {
            await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 200))]);
          }
          if (an && ctx?.state === "running") {
            const src = ctx.createMediaElementSource(audio);
            src.connect(an);
            analysingRef.current = true;
            envelopeRef.current = 0;
            // Routed: the gain node is the volume, the element must stay at 1
            // (desktop would otherwise apply both — volume squared).
            if (gainRef.current) {
              gainRef.current.gain.value = volumeRef.current;
              audio.volume = 1;
            }
          }
        } catch {
          // analyser unavailable — plain playback, synthetic mouth cadence
        }
        audio.onplay = () => setSpeaking(true);
        audio.onended = onDone;
        audio.onerror = onDone;
        void audio.play().catch(onDone);
      })();
    } catch {
      onDone();
    }
  };

  /** Silence CoSiMo instantly (barge-in): stop server-TTS clips + browser speech. */
  const stopPlayback = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    analysingRef.current = false;
    const q = ttsQueueRef.current;
    q.pending.clear(); q.ended = false; q.playing = false; q.turn = -2;
    if (settleTimerRef.current) { clearTimeout(settleTimerRef.current); settleTimerRef.current = null; }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  useEffect(() => {
    // Empty URL = same origin (the dev proxy routes the socket path).
    const socket: CosimoSocket = realtimeUrl
      ? io(realtimeUrl, { transports: ["websocket"] })
      : io({ transports: ["websocket"] });
    sockRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Fresh server state → fresh turn numbering.
      turnRef.current = 0;
      socket.emit("hello", { deviceId, role, kind, ...(token ? { token } : {}), ...(seat ? { seat } : {}), ...(showcase ? { showcase: true } : {}), ...(autoCheckout ? {} : { autoCheckout: false }) });
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("devices:update", ({ devices }) => setDevices(devices));
    // The hub's link check: answer the ack at once. Every client does —
    // kiosks, the emulator, consoles — that is what makes the RTT honest.
    socket.on("sys:ping", (ack) => ack());
    socket.on("host:seats", ({ seats, cabin: shared }) => { setSeats(seats); setHostCabin(shared ?? []); });
    socket.on("host:personas", ({ personas }) => setPersonas(personas));
    socket.on("host:config", (cfg) => setHostConfig(cfg));
    socket.on("host:rig-state", (r) => setRig(r));
    socket.on("light:state", (l) => setLightState(l));
    socket.on("host:llm-test-result", (r) => setLlmTest(r));
    socket.on("host:tts-test-result", (r) => setTtsTest(r));
    socket.on("host:stt-test-result", (r) => setSttTest(r));
    socket.on("host:services", ({ services }) => setServices(services));
    socket.on("host:reload", () => setReloadRequired(true));
    socket.on("host:evicted", ({ max }) => setEvicted({ max }));
    socket.on("host:unauthorized", () => setUnauthorized(true));
    socket.on("host:restart-result", ({ id, ok, error }) => setRestartResults((r) => ({ ...r, [id]: { ok, error, at: Date.now() } })));
    socket.on("host:inspect:result", (r) => setInspection(r));
    socket.on("host:log", ({ events }) => {
      // Merge by seq (a replay may overlap what we already have), keep order,
      // and cap so a long day never grows the tab unboundedly.
      setLogs((prev) => {
        const seen = new Set(prev.map((e) => e.seq));
        const fresh = events.filter((e) => !seen.has(e.seq));
        if (!fresh.length) return prev;
        const next = [...prev, ...fresh].sort((a, b) => a.seq - b.seq);
        return next.length > LOG_MAX ? next.slice(next.length - LOG_MAX) : next;
      });
    });
    socket.on("session:reset", ({ deviceId: target, sessionId: given, consent }) => {
      if (target !== deviceId && target !== "*") return;
      // The hub owns session ids: adopt the one it hands us (persona switch,
      // reset); only a legacy hub without one makes us mint our own.
      sessionRef.current = given ? adoptSession(role, given) : newSession(role);
      turnRef.current = 0;
      replyRef.current = "";
      setReply("");
      setHeard("");
      setReplying(false);
      setTranscript([]);
      setCard(null);
      setSettings(null);
      stopPlayback();
      setLastReset({ nonce: Date.now(), consent: consent ?? null });
      setCheckedIn(false);
      setResetNonce((n) => n + 1);
    });
    socket.on("session:checkin", () => setCheckedIn(true));

    socket.on("face:emotion", ({ emotion }) => setEmotion(emotion));
    socket.on("pipeline:phase", ({ phase }) => setPhase(phase));
    socket.on("telemetry:update", (t) => setTelemetry(t));
    socket.on("status:update", (s) => setStatus(s));
    socket.on("cabin:state", ({ controls }) => setCabin(controls));
    // The hub hands us ready-made URLs for the cabin controller; we only fire
    // them and answer. A client with no actuator (host console, browser dev)
    // stays silent, and the hub keeps the control's last-known state.
    socket.on("cabin:actuate", (actuation) => {
      const perform = actuatorRef.current;
      if (!perform) return;
      void perform(actuation)
        .catch((err: unknown) => ({
          control: actuation.control,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }))
        .then((result) => socket.emit("cabin:actuate:result", result));
    });
    socket.on("seat:card", ({ card: c, turn }) => {
      if (turn !== -1 && turn < turnRef.current) return; // stale turn's card
      setCard(c);
    });
    socket.on("seat:settings", (p) => {
      if (p.turn !== -1 && p.turn < turnRef.current) return;
      setSettings(p);
      touch();
    });
    socket.on("persona:active", (p) => {
      setPersonaState(p);
      volumeRef.current = Math.max(0, Math.min(1, p.accommodations.volume ?? 1));
      // Mid-clip too — "leiser bitte" lands while the confirmation plays.
      if (gainRef.current) gainRef.current.gain.value = volumeRef.current;
    });
    socket.on("voice:transcript", ({ text }) => {
      setHeard(text);
      // Server-STT path: the rider's words arrive here (browser-STT goes via send()).
      if (text.trim()) setTranscript((t) => [...t, { role: "user", text }]);
    });
    socket.on("tts:chunk", ({ sessionId: sid, turn, seq, last, audioBase64, mime, text }) => {
      if (sid && sid !== sessionRef.current) return; // another seat's voice — never ours
      // A clip from a superseded (barged-in) turn arrives late — drop it.
      if (turn !== -1 && turn < turnRef.current) return;
      const q = ttsQueueRef.current;
      if (q.turn !== turn) {
        // a new turn's speech: whatever is still playing is stale
        audioRef.current?.pause();
        analysingRef.current = false;
        q.turn = turn; q.next = 0; q.pending.clear(); q.ended = false; q.playing = false;
      }
      if (last) {
        q.ended = true;
        if (!q.playing && q.pending.size === 0) settleSpeaking();
        return;
      }
      q.pending.set(seq, { audioBase64, mime, text });
      playNextChunk();
    });

    socket.on("chat:delta", ({ sessionId: sid, text, done, turn }) => {
      // only this seat's session (or the "*" reset marker) — defence in depth
      if (sid && sid !== "*" && sid !== sessionRef.current) return;
      if (turn !== -1) {
        if (turn < turnRef.current) return; // stale turn (barged-in) — drop
        if (turn > turnRef.current) {
          // A newer turn started streaming — reset the reply view for it.
          turnRef.current = turn;
          replyRef.current = "";
          setReply("");
        }
      }
      if (done) {
        setReplying(false);
        const full = replyRef.current.trim();
        if (full) {
          setTranscript((t) => [...t, { role: "cosimo", text: full }]);
          setLastReplyAt(Date.now()); // arms the ↻ affordance
        }
        return;
      }
      setReplying(true);
      replyRef.current += text;
      setReply(replyRef.current);
    });

    return () => {
      socket.close();
      sockRef.current = null;
    };
  }, [realtimeUrl, deviceId, role, kind, token, seat, showcase, autoCheckout]);

  const clearCard = () => setCard(null);

  const closeSettings = () => setSettings(null);

  /** The guest chip: continue without a card (the default profile). */
  const checkIn = () => {
    touch();
    setCheckedIn(true);
    sockRef.current?.emit("session:checkin", { sessionId: sessionRef.current });
  };

  const patchSettings = (patch: Partial<Accommodations>, speak: boolean, reset = false) => {
    touch();
    sockRef.current?.emit("settings:patch", { sessionId: sessionRef.current, patch, speak, ...(reset ? { reset: true } : {}) });
  };

  const repeatLast = () => {
    touch();
    sockRef.current?.emit("reply:repeat", { sessionId: sessionRef.current });
  };

  const send = (text: string, lang: Locale, modality: Modality = "text") => {
    touch();
    setCard(null); // any user turn answers/invalidates the card
    setSettings(null); // and ends the settings menu — the rider is talking now
    const socket = sockRef.current;
    if (!socket) return;
    stopPlayback(); // new input supersedes whatever CoSiMo was saying
    replyRef.current = "";
    setReply("");
    setReplying(true);
    if (text.trim()) setTranscript((t) => [...t, { role: "user", text }]);
    socket.emit("chat:send", { sessionId: sessionRef.current, text, lang, modality });
  };

  const setPersona = (key: PersonaKey, deviceId?: string) => {
    sockRef.current?.emit("host:setPersona", { persona: key, deviceId });
  };

  const setConsent = (consent: boolean) => {
    ensureAnalyser(); // user gesture — unlock the AudioContext for mouth sync
    sockRef.current?.emit("consent:set", { sessionId: sessionRef.current, consent });
  };

  /** Sample the playing clip's envelope + brightness (see CosimoState docs). */
  const getMouthDrive = useCallback((): { open: number; tilt: number } | null => {
    const an = analyserRef.current;
    const timeBuf = timeBufRef.current;
    const freqBuf = freqBufRef.current;
    if (!an || !timeBuf || !freqBuf || !analysingRef.current) return null;

    // Loudness: RMS of the time-domain signal → gained, gamma'd envelope with
    // fast attack / slower release so the mouth snaps open but eases shut.
    an.getByteTimeDomainData(timeBuf);
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) {
      const v = (timeBuf[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeBuf.length);
    const target = Math.min(1, Math.pow(Math.max(0, rms - 0.02) * 5, 0.8));
    const prev = envelopeRef.current;
    const level = prev + (target - prev) * (target > prev ? 0.55 : 0.18);
    envelopeRef.current = level;

    // Brightness: energy above ~1 kHz vs below → bright "iii" (wide mouth)
    // against dark "ooo" (round mouth). Bin width ≈ sampleRate / fftSize.
    an.getByteFrequencyData(freqBuf);
    const binHz = (audioCtxRef.current?.sampleRate ?? 48_000) / an.fftSize;
    const split = Math.max(2, Math.round(1000 / binHz));
    const top = Math.min(freqBuf.length, Math.round(4000 / binHz));
    let low = 0;
    let high = 0;
    for (let i = 1; i < split; i++) low += freqBuf[i]!;
    for (let i = split; i < top; i++) high += freqBuf[i]!;
    const tilt = low + high > 0 ? high / (low + high) : 0.5;

    return { open: level, tilt };
  }, []);

  const overrideLight = (deviceId: string, control: CabinControlId, on: boolean) =>
    sockRef.current?.emit("host:overrideLight", { deviceId, control, on });
  const setCabinControl = (deviceId: string, control: CabinControlId, change: { on?: boolean; level?: number; scene?: string; flash?: true }) =>
    sockRef.current?.emit("host:overrideLight", { deviceId, control, ...change });
  const patchTelemetry = (patch: HostTelemetryPatch) =>
    sockRef.current?.emit("host:patchTelemetry", patch);
  const toggleOffline = (offline: boolean) =>
    sockRef.current?.emit("host:toggleOffline", { offline });
  const recover = () => sockRef.current?.emit("host:recover", {});
  const resetSession = (target: string) =>
    sockRef.current?.emit("host:resetSession", { deviceId: target });
  const probeDevices = () => sockRef.current?.emit("host:probe", {});
  const resetAll = () => sockRef.current?.emit("host:reset-all", {});
  const resetDevice = (deviceId: string) => sockRef.current?.emit("host:reset-device", { deviceId });
  const restartService = (id: ServiceInfo["id"]) => sockRef.current?.emit("host:restart-service", { id });
  const testLlm = () => {
    setLlmTest("pending");
    sockRef.current?.emit("host:llm-test", {});
  };
  /** Kiosk operator menu: the same rig actions, fired by this iPad. */
  const cabinLight = (key: string, on?: boolean) => {
    sockRef.current?.emit("cabin:light", { key, ...(on !== undefined ? { on } : {}) });
  };
  /** Console light buttons: zone/signal key on/off, or "blackout" / "release-all" / "hello". */
  const hostRig = (a: HostRigAction) => {
    sockRef.current?.emit("host:rig", a);
  };
  const setLight = (req: LightSetRequest) => {
    touch();
    sockRef.current?.emit("light:set", req);
  };
  const saveScene = (req: SceneSaveRequest) => {
    sockRef.current?.emit("host:scene-save", req);
  };

  const hostLight = (key: string, on?: boolean) => {
    sockRef.current?.emit("host:light", { key, ...(on !== undefined ? { on } : {}) });
  };
  const testTts = (voice?: string) => {
    setTtsTest("pending");
    sockRef.current?.emit("host:tts-test", voice ? { voice } : {});
  };
  const testStt = () => {
    setSttTest("pending");
    sockRef.current?.emit("host:stt-test", {});
  };
  const inspectSeat = (deviceId: string) =>
    sockRef.current?.emit("host:inspect", { deviceId });
  const clearInspection = () => setInspection(null);

  // The consent tap used to be the guaranteed first gesture that unlocked
  // the AudioContext; card riders skip that screen now. So: the very first
  // touch or key on the page — whatever it is — unlocks playback volume.
  useEffect(() => {
    const unlock = () => ensureAnalyser();
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  const pttStart = () => {
    touch();
    // Barge-in: the button press itself silences CoSiMo — instantly locally,
    // and the server aborts the seat's in-flight turn on ptt:start.
    stopPlayback();
    ensureAnalyser(); // user gesture — keep the AudioContext unlocked
    sockRef.current?.emit("ptt:start", { sessionId: sessionRef.current });
  };
  const pttStop = () =>
    sockRef.current?.emit("ptt:stop", { sessionId: sessionRef.current });

  const sendUtterance = (audioBase64: string, mime: string, lang: Locale) => {
    replyRef.current = "";
    setReply("");
    setReplying(true);
    sockRef.current?.emit("voice:utterance", {
      sessionId: sessionRef.current,
      audioBase64,
      mime,
      lang,
    });
  };

  const clearLogs = useCallback(() => setLogs([]), []);
  const replayLogs = useCallback((since?: number) => {
    sockRef.current?.emit("host:log:replay", since != null ? { since } : {});
  }, []);

  const registerNfc = (tagId: string, lang: Locale) => {
    ensureAnalyser(); // the scan's keydown is a user activation — unlock before the greeting speaks
    sockRef.current?.emit("nfc:register", { sessionId: sessionRef.current, tagId, lang });
  };

  const setCabinActuator = useCallback(
    (perform: ((a: CabinActuation) => Promise<CabinActuationResult>) | null) => {
      actuatorRef.current = perform;
    },
    [],
  );

  const faceEmotion: FaceEmotion = speaking ? "speaking" : emotion;

  return {
    connected, emotion, phase, reply, replying, transcript, card, clearCard, settings, closeSettings, patchSettings, repeatLast, lastReplyAt, caption, lastActivityAt, lastReset, checkedIn, checkIn,
    telemetry, status, cabin, hostCabin, persona, heard, devices, seats, personas, hostConfig, services, resetNonce,
    llmTest, testLlm, hostLight, cabinLight, rig, hostRig, light, setLight, saveScene, ttsTest, testTts, sttTest, testStt,
    setCabinActuator,
    inspection, inspectSeat, clearInspection, probeDevices, resetAll, resetDevice, reloadRequired, evicted, deviceId,
    unauthorized, restartService, restartResults,
    logs, clearLogs, replayLogs,
    faceEmotion, speaking, setSpeaking, getMouthDrive,
    send, setPersona, setConsent, pttStart, pttStop, sendUtterance, registerNfc,
    overrideLight, setCabinControl, patchTelemetry, toggleOffline, recover, resetSession,
    sessionId: sessionRef.current,
  };
}
