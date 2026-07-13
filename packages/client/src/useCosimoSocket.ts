"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  CabinControlId,
  CabinControlState,
  ClientToServerEvents,
  ConnectedDevice,
  ConnectionStatus,
  FaceEmotion,
  HostTelemetryPatch,
  Locale,
  Modality,
  MonoCabTelemetry,
  PersonaBroadcast,
  PersonaKey,
  PipelinePhase,
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
  /** The active persona (theme + presentation), or null before first sync. */
  persona: PersonaBroadcast | null;
  /** Emotion to render on the Face — "speaking" while audio plays, else the
   *  server's emotion. Keeps the moving mouth in sync with the actual voice. */
  faceEmotion: FaceEmotion;
  /** True while CoSiMo's voice is actually playing. */
  speaking: boolean;
  /** Signal that locally-generated speech (browser TTS) started/stopped. */
  setSpeaking: (on: boolean) => void;
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
  const [heard, setHeard] = useState("");
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [seats, setSeats] = useState<SeatSummary[]>([]);
  const [personas, setPersonas] = useState<PersonaBroadcast[]>([]);
  const [resetNonce, setResetNonce] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Highest turn number seen — chunks/clips from lower (barged-in) turns are dropped. */
  const turnRef = useRef(0);

  /** Silence CoSiMo instantly (barge-in): stop server-TTS clip + browser speech. */
  const stopPlayback = () => {
    audioRef.current?.pause();
    audioRef.current = null;
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
    socket.on("persona:active", (p) => setPersonaState(p));
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
        const audio = new Audio(`data:${mime};base64,${audioBase64}`);
        audioRef.current = audio;
        audio.onplay = () => setSpeaking(true);
        audio.onended = () => setSpeaking(false);
        audio.onerror = () => setSpeaking(false);
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
    sockRef.current?.emit("consent:set", { sessionId: sessionRef.current, consent });
  };

  const overrideLight = (deviceId: string, control: CabinControlId, on: boolean) =>
    sockRef.current?.emit("host:overrideLight", { deviceId, control, on });
  const patchTelemetry = (patch: HostTelemetryPatch) =>
    sockRef.current?.emit("host:patchTelemetry", patch);
  const toggleOffline = (offline: boolean) =>
    sockRef.current?.emit("host:toggleOffline", { offline });
  const recover = () => sockRef.current?.emit("host:recover", {});
  const resetSession = (target: string) =>
    sockRef.current?.emit("host:resetSession", { deviceId: target });

  const pttStart = () => {
    // Barge-in: the button press itself silences CoSiMo — instantly locally,
    // and the server aborts the seat's in-flight turn on ptt:start.
    stopPlayback();
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

  const registerNfc = (tagId: string, lang: Locale) => {
    sockRef.current?.emit("nfc:register", { sessionId: sessionRef.current, tagId, lang });
  };

  const faceEmotion: FaceEmotion = speaking ? "speaking" : emotion;

  return {
    connected, emotion, phase, reply, replying, transcript,
    telemetry, status, cabin, persona, heard, devices, seats, personas, resetNonce,
    faceEmotion, speaking, setSpeaking,
    send, setPersona, setConsent, pttStart, pttStop, sendUtterance, registerNfc,
    overrideLight, patchTelemetry, toggleOffline, recover, resetSession,
    sessionId: sessionRef.current,
  };
}
