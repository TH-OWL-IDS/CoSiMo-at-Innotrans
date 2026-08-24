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
} from "@cosimo/shared";

type CosimoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface CosimoState {
  connected: boolean;
  emotion: FaceEmotion;
  phase: PipelinePhase;
  /** The streaming reply text for the current/last CoSiMo turn. */
  reply: string;
  /** True while CoSiMo's reply is still streaming. */
  replying: boolean;
  /** Running conversation history (rider + CoSiMo), for the text-first layout. */
  transcript: { role: "user" | "cosimo"; text: string }[];
  telemetry: MonoCabTelemetry | null;
  status: ConnectionStatus | null;
  /** Live cabin-control state, kept in sync across all iPads. */
  cabin: CabinControlState[];
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
  /** Deep view of one seat (host inspector), latest host:inspect result. */
  inspection: SeatInspection | null;
  /** Request a seat's deep view (system prompt + turns). */
  inspectSeat: (deviceId: string) => void;
  clearInspection: () => void;
  /** Bumps when this device is reset by the host (re-show the welcome). */
  resetNonce: number;
  /** Host actions. */
  overrideLight: (deviceId: string, control: CabinControlId, on: boolean) => void;
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
): CosimoState {
  const sockRef = useRef<CosimoSocket | null>(null);
  const deviceId = useMemo(() => makeId(role === "host" ? "host" : "ipad"), [role]);
  const sessionRef = useRef<string>(makeId("s"));

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
  /** Live playback volume for TTS clips — a ref, because the tts:audio
   *  handler lives inside the socket-setup effect and must not go stale. */
  const volumeRef = useRef(1);
  const [heard, setHeard] = useState("");
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [seats, setSeats] = useState<SeatSummary[]>([]);
  const [personas, setPersonas] = useState<PersonaBroadcast[]>([]);
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
      an.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = an;
      timeBufRef.current = new Uint8Array(an.fftSize);
      freqBufRef.current = new Uint8Array(an.frequencyBinCount);
    }
    if (audioCtxRef.current.state !== "running") void audioCtxRef.current.resume();
    return analyserRef.current;
  };

  /** Silence CoSiMo instantly (barge-in): stop server-TTS clip + browser speech. */
  const stopPlayback = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    analysingRef.current = false;
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
      socket.emit("hello", { deviceId, role });
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("devices:update", ({ devices }) => setDevices(devices));
    socket.on("host:seats", ({ seats }) => setSeats(seats));
    socket.on("host:personas", ({ personas }) => setPersonas(personas));
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
    socket.on("session:reset", ({ deviceId: target }) => {
      if (target !== deviceId && target !== "*") return;
      sessionRef.current = makeId("s");
      replyRef.current = "";
      setReply("");
      setHeard("");
      setReplying(false);
      setTranscript([]);
      setResetNonce((n) => n + 1);
    });

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
    socket.on("persona:active", (p) => {
      setPersonaState(p);
      volumeRef.current = Math.max(0, Math.min(1, p.accommodations.volume ?? 1));
    });
    socket.on("voice:transcript", ({ text }) => {
      setHeard(text);
      // Server-STT path: the rider's words arrive here (browser-STT goes via send()).
      if (text.trim()) setTranscript((t) => [...t, { role: "user", text }]);
    });
    socket.on("tts:audio", ({ audioBase64, mime, turn }) => {
      // A clip from a superseded (barged-in) turn arrives late — drop it.
      if (turn !== -1 && turn < turnRef.current) return;
      try {
        // Stop any previous clip, then play — the Face's mouth follows the audio.
        audioRef.current?.pause();
        analysingRef.current = false;
        const audio = new Audio(`data:${mime};base64,${audioBase64}`);
        audio.volume = volumeRef.current; // "leiser bitte" — playback-side, instant
        audioRef.current = audio;
        // Route the clip through the analyser so the mouth can follow the
        // actual voice. Only when the context is unlocked ("running") — a
        // suspended context would swallow the sound entirely.
        try {
          const an = ensureAnalyser();
          if (an && audioCtxRef.current?.state === "running") {
            const src = audioCtxRef.current.createMediaElementSource(audio);
            src.connect(an);
            analysingRef.current = true;
            envelopeRef.current = 0;
          }
        } catch {
          // analyser unavailable — plain playback, synthetic mouth cadence
        }
        audio.onplay = () => setSpeaking(true);
        audio.onended = () => { analysingRef.current = false; setSpeaking(false); };
        audio.onerror = () => { analysingRef.current = false; setSpeaking(false); };
        void audio.play().catch(() => setSpeaking(false));
      } catch {
        setSpeaking(false);
      }
    });

    socket.on("chat:delta", ({ text, done, turn }) => {
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
        if (full) setTranscript((t) => [...t, { role: "cosimo", text: full }]);
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
  }, [realtimeUrl, deviceId, role]);

  const send = (text: string, lang: Locale, modality: Modality = "text") => {
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
  const patchTelemetry = (patch: HostTelemetryPatch) =>
    sockRef.current?.emit("host:patchTelemetry", patch);
  const toggleOffline = (offline: boolean) =>
    sockRef.current?.emit("host:toggleOffline", { offline });
  const recover = () => sockRef.current?.emit("host:recover", {});
  const resetSession = (target: string) =>
    sockRef.current?.emit("host:resetSession", { deviceId: target });
  const inspectSeat = (deviceId: string) =>
    sockRef.current?.emit("host:inspect", { deviceId });
  const clearInspection = () => setInspection(null);

  const pttStart = () => {
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
    connected, emotion, phase, reply, replying, transcript,
    telemetry, status, cabin, persona, heard, devices, seats, personas, resetNonce,
    setCabinActuator,
    inspection, inspectSeat, clearInspection,
    logs, clearLogs, replayLogs,
    faceEmotion, speaking, setSpeaking, getMouthDrive,
    send, setPersona, setConsent, pttStart, pttStop, sendUtterance, registerNfc,
    overrideLight, patchTelemetry, toggleOffline, recover, resetSession,
    sessionId: sessionRef.current,
  };
}
