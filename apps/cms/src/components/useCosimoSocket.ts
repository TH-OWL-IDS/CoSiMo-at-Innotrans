"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  CabinControlState,
  ClientToServerEvents,
  ConnectionStatus,
  FaceEmotion,
  Locale,
  MonoCabTelemetry,
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
  /** Send a text-fallback message to CoSiMo. */
  send: (text: string, lang: Locale) => void;
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
export function useCosimoSocket(realtimeUrl: string): CosimoState {
  const sockRef = useRef<CosimoSocket | null>(null);
  const deviceId = useMemo(() => makeId("ipad"), []);
  const sessionRef = useRef<string>(makeId("s"));

  const [connected, setConnected] = useState(false);
  const [emotion, setEmotion] = useState<FaceEmotion>("sleeping");
  const [phase, setPhase] = useState<PipelinePhase>("idle");
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [telemetry, setTelemetry] = useState<MonoCabTelemetry | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [cabin, setCabin] = useState<CabinControlState[]>([]);

  useEffect(() => {
    const socket: CosimoSocket = io(realtimeUrl, { transports: ["websocket"] });
    sockRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("hello", { deviceId, role: "kiosk" });
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("face:emotion", ({ emotion }) => setEmotion(emotion));
    socket.on("pipeline:phase", ({ phase }) => setPhase(phase));
    socket.on("telemetry:update", (t) => setTelemetry(t));
    socket.on("status:update", (s) => setStatus(s));
    socket.on("cabin:state", ({ controls }) => setCabin(controls));

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
  }, [realtimeUrl, deviceId]);

  const send = (text: string, lang: Locale) => {
    const socket = sockRef.current;
    if (!socket) return;
    setReply("");
    setReplying(true);
    socket.emit("chat:send", { sessionId: sessionRef.current, text, lang });
  };

  return { connected, emotion, phase, reply, replying, telemetry, status, cabin, send };
}
