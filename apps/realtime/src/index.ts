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
import { createLightDriver } from "./cabin/driver.js";

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: config.corsOrigins, methods: ["GET", "POST"] },
});

const personas = new PersonaProvider();
const hub = new Hub(io);
hub.attachLightDriver(createLightDriver(config.light.driver, config.light.shellyBaseUrl));
hub.setPersonaResolver((key) => personas.toBroadcast(key));
const agent = new CosimoAgent(hub, personas);

// Load personas from the CMS (best-effort; built-in defaults otherwise),
// then re-resolve the active persona so its theme reaches connected clients.
void personas.refresh().then(() => hub.setPersona("default"));

// Route incoming user turns through the agent loop.
hub.onChat((chat) => {
  void agent.handleUserTurn(chat);
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
