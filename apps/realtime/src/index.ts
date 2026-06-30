/**
 * CoSiMo realtime/agent service — Phase 0 skeleton.
 *
 * Express HTTP (health) + Socket.IO hub that will, in later phases, run the
 * Claude agent loop, STT/TTS, the Shelly light driver, telemetry, the persona
 * engine and the offline canned mode. For now it stands up the server and the
 * WebSocket plumbing so the PWA can connect and stay in sync.
 */

import { createServer } from "node:http";
import express from "express";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@cosimo/shared";
import { config } from "./config.js";
import { Hub } from "./hub.js";
import { CosimoAgent } from "./agent/agent.js";
import { PersonaProvider } from "./agent/personas.js";
import { TelemetryProvider } from "./agent/telemetry.js";
import { createLightDriver } from "./cabin/driver.js";
import { createSttProvider } from "./speech/stt.js";
import { createTtsProvider } from "./speech/tts.js";
import { startHealthMonitor } from "./health.js";

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: config.corsOrigins, methods: ["GET", "POST"] },
});

const personas = new PersonaProvider();
const telemetry = new TelemetryProvider();
const stt = createSttProvider();
const tts = createTtsProvider();
const hub = new Hub(io);
hub.attachLightDriver(createLightDriver(config.light.driver, config.light.shellyBaseUrl));
hub.setPersonaResolver((key) => personas.toBroadcast(key));
hub.setStatus({ serverStt: stt.available, serverTts: tts.available });
const agent = new CosimoAgent(hub, personas, tts, telemetry);

// Load personas from the CMS (best-effort; built-in defaults otherwise),
// then re-resolve the active persona so its theme reaches connected clients.
void personas.refresh().then(() => hub.setPersona("default"));

// Keep an always-on telemetry display: refresh from the CMS and broadcast.
async function broadcastTelemetry(): Promise<void> {
  hub.emitTelemetry(await telemetry.refresh());
}
void broadcastTelemetry();
setInterval(() => void broadcastTelemetry(), 5000);

// Watch connectivity → auto-switch to offline canned mode when the cloud drops.
startHealthMonitor(hub);

// Route incoming user turns through the agent loop.
hub.onChat((chat) => {
  void agent.handleUserTurn(chat);
});

// Voice utterances → server STT → agent (voice modality).
hub.onVoice(async (v) => {
  try {
    const audio = Buffer.from(v.audioBase64, "base64");
    const text = await stt.transcribe(audio, v.mime, v.lang);
    if (!text) return;
    hub.emitTranscript(v.sessionId, text, v.lang);
    void agent.handleUserTurn({
      sessionId: v.sessionId,
      deviceId: v.deviceId,
      text,
      lang: v.lang,
      persona: v.persona,
      modality: "voice",
      consent: v.consent,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cosimo-realtime] voice STT failed:", err);
  }
});

io.on("connection", (socket) => {
  hub.register(socket);
});

app.get("/health", (_req, res) => {
  res.json({
    service: "cosimo-realtime",
    status: "ok",
    devices: hub.connectedDevices,
    model: config.anthropic.model,
    lightDriver: config.light.driver,
  });
});

httpServer.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[cosimo-realtime] listening on :${config.port}`);
});
