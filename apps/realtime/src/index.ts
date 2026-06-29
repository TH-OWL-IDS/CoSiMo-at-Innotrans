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

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: config.corsOrigins, methods: ["GET", "POST"] },
});

const hub = new Hub(io);
const agent = new CosimoAgent(hub);

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
