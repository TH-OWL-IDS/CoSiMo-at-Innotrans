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
  telemetry: MonoCabTelemetry | null;
  status: ConnectionStatus | null;
  /** Live cabin-control state, kept in sync across all iPads. */
  cabin: CabinControlState[];
  /** The active persona (theme + presentation), or null before first sync. */
  persona: PersonaBroadcast | null;
  /** Last thing CoSiMo heard via server STT (for display). */
  heard: string;
  /** Send a message to CoSiMo (text or browser-transcribed voice). */
  send: (text: string, lang: Locale, modality?: Modality) => void;
  /** Switch the active persona (host action). */
  setPersona: (key: PersonaKey) => void;
  /** Record the visitor's GDPR consent decision for this session. */
  setConsent: (consent: boolean) => void;
  /** Connected devices (operator console). */
  devices: ConnectedDevice[];
  /** Bumps when this device is reset by the host (re-show the welcome). */
  resetNonce: number;
  /** Host actions. */
  overrideLight: (control: CabinControlId, on: boolean) => void;
  patchTelemetry: (patch: HostTelemetryPatch) => void;
  toggleOffline: (offline: boolean) => void;
  recover: () => void;
  resetSession: (deviceId: string) => void;
  /** Push-to-talk lifecycle (drives the listening Face). */
  pttStart: () => void;
  pttStop: () => void;
  /** Upload a recorded utterance for server STT. */
  sendUtterance: (audioBase64: string, mime: string, lang: Locale) => void;
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
  const [replying, setReplying] = useState(false);
  const [telemetry, setTelemetry] = useState<MonoCabTelemetry | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [cabin, setCabin] = useState<CabinControlState[]>([]);
  const [persona, setPersonaState] = useState<PersonaBroadcast | null>(null);
  const [heard, setHeard] = useState("");
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => {
    const socket: CosimoSocket = io(realtimeUrl, { transports: ["websocket"] });
    sockRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("hello", { deviceId, role });
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("devices:update", ({ devices }) => setDevices(devices));
    socket.on("session:reset", ({ deviceId: target }) => {
      if (target !== deviceId && target !== "*") return;
      sessionRef.current = makeId("s");
      setReply("");
      setHeard("");
      setReplying(false);
      setResetNonce((n) => n + 1);
    });

    socket.on("face:emotion", ({ emotion }) => setEmotion(emotion));
    socket.on("pipeline:phase", ({ phase }) => setPhase(phase));
    socket.on("telemetry:update", (t) => setTelemetry(t));
    socket.on("status:update", (s) => setStatus(s));
    socket.on("cabin:state", ({ controls }) => setCabin(controls));
    socket.on("persona:active", (p) => setPersonaState(p));
    socket.on("voice:transcript", ({ text }) => setHeard(text));
    socket.on("tts:audio", ({ audioBase64, mime }) => {
      try {
        const audio = new Audio(`data:${mime};base64,${audioBase64}`);
        void audio.play();
      } catch {
        /* autoplay may be blocked until first interaction */
      }
    });

    socket.on("chat:delta", ({ text, done }) => {
      if (done) {
        setReplying(false);
        return;
      }
      setReplying(true);
      setReply((r) => r + text);
    });

    return () => {
      socket.close();
      sockRef.current = null;
    };
  }, [realtimeUrl, deviceId, role]);

  const send = (text: string, lang: Locale, modality: Modality = "text") => {
    const socket = sockRef.current;
    if (!socket) return;
    setReply("");
    setReplying(true);
    socket.emit("chat:send", { sessionId: sessionRef.current, text, lang, modality });
  };

  const setPersona = (key: PersonaKey) => {
    sockRef.current?.emit("host:setPersona", { persona: key });
  };

  const setConsent = (consent: boolean) => {
    sockRef.current?.emit("consent:set", { sessionId: sessionRef.current, consent });
  };

  const overrideLight = (control: CabinControlId, on: boolean) =>
    sockRef.current?.emit("host:overrideLight", { control, on });
  const patchTelemetry = (patch: HostTelemetryPatch) =>
    sockRef.current?.emit("host:patchTelemetry", patch);
  const toggleOffline = (offline: boolean) =>
    sockRef.current?.emit("host:toggleOffline", { offline });
  const recover = () => sockRef.current?.emit("host:recover", {});
  const resetSession = (target: string) =>
    sockRef.current?.emit("host:resetSession", { deviceId: target });

  const pttStart = () =>
    sockRef.current?.emit("ptt:start", { sessionId: sessionRef.current });
  const pttStop = () =>
    sockRef.current?.emit("ptt:stop", { sessionId: sessionRef.current });

  const sendUtterance = (audioBase64: string, mime: string, lang: Locale) => {
    setReply("");
    setReplying(true);
    sockRef.current?.emit("voice:utterance", {
      sessionId: sessionRef.current,
      audioBase64,
      mime,
      lang,
    });
  };

  return {
    connected, emotion, phase, reply, replying,
    telemetry, status, cabin, persona, heard, devices, resetNonce,
    send, setPersona, setConsent, pttStart, pttStop, sendUtterance,
    overrideLight, patchTelemetry, toggleOffline, recover, resetSession,
    sessionId: sessionRef.current,
  };
}
