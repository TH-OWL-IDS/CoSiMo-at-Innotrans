/**
 * CoSiMo realtime/agent service — Phase 0 skeleton.
 *
 * Express HTTP (health) + Socket.IO hub that will, in later phases, run the
 * Claude agent loop, STT/TTS, the Shelly light driver, telemetry, the persona
 * engine and the offline canned mode. For now it stands up the server and the
 * WebSocket plumbing so the PWA can connect and stay in sync.
 */

import { existsSync } from "node:fs";
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
import { LlmRouter } from "./agent/llm.js";
import { OperatorConfigProvider } from "./agent/operatorConfig.js";
import { PersonaProvider } from "./agent/personas.js";
import { TelemetrySimulation } from "./agent/telemetry.js";
import { createLightDriver } from "./cabin/driver.js";
import { createSttProvider } from "./speech/stt.js";
import { createTtsProvider } from "./speech/tts.js";
import { startHealthMonitor } from "./health.js";
import { ServicesMonitor } from "./services.js";
import { logger } from "./log/logger.js";
import { TOOL_DEFINITIONS } from "./agent/tools.js";
import { greetingFor } from "./agent/prompt.js";

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: config.corsOrigins, methods: ["GET", "POST"] },
});

const personas = new PersonaProvider();
const telemetry = new TelemetrySimulation();
const operatorConfig = new OperatorConfigProvider();
const stt = createSttProvider(operatorConfig);
const tts = createTtsProvider(operatorConfig);
const llm = new LlmRouter(operatorConfig);
const hub = new Hub(io);
hub.attachLightDriver(createLightDriver(config.light.driver, config.light.shellyBaseUrl));
// Cabin lighting is actuated BY THE SEATS (air-gapped cabin LAN) — the hub
// only builds the URLs, from the TTL-cached operator config.
hub.setCabinActuator(() => {
  const cabin = operatorConfig.get().cabin;
  return {
    baseUrl: cabin.lpu2BaseUrl,
    mapping: cabin.lpu2Mapping,
    timeoutMs: cabin.lpu2TimeoutMs,
  };
});
hub.setPersonaResolver((key) => personas.toBroadcast(key));
hub.setPersonaLister(() => personas.list());
hub.setMemoriesResolver((key) => personas.memoriesOf(key).map((m) => m.note));
hub.setStatus({ serverStt: stt.available, serverTts: tts.available });
const agent = new CosimoAgent(hub, personas, tts, telemetry, llm, operatorConfig);
const profiles = agent.profileSink;
// After the agent exists: the console's config card carries the prompt as
// the agent builds it (the lister runs synchronously on set/connect).
hub.setConfigLister(() => ({
  ...operatorConfig.toBroadcast(),
  systemPrompt: agent.currentSystemPrompt(),
  tools: TOOL_DEFINITIONS.map((t) => ({ name: t.name, description: t.description ?? "", schema: t.input_schema })),
}));

// Load personas + operator config from the CMS (best-effort; env/built-in
// defaults otherwise), then re-resolve the active persona for the clients and
// push the authored persona set to any connected host consoles.
void operatorConfig.refresh().then(() => hub.broadcastConfig());
// Keep the console's routing view honest: re-read on the provider's TTL
// even when no turn is running, and push only if something changed.
setInterval(() => void operatorConfig.refresh().then(() => hub.broadcastConfig()), 15_000);
// The link check: ping every device socket every 2 s, classify, push
// changes to the consoles only (hub.probeDevices logs transitions).
setInterval(() => void hub.probeDevices(), 2_000);
void personas.refresh().then(() => {
  hub.setPersona("default", "boot");
  hub.broadcastPersonas();
});

// The journey simulation ticks every second: advance the state machine
// (route refreshed from the CMS on its own TTL) and broadcast the derived
// telemetry so ETAs/speed move smoothly on every display.
async function broadcastTelemetry(): Promise<void> {
  // The real riders count: a seat with a live session is a passenger.
  telemetry.setLiveSessions(hub.activeSeats);
  hub.emitTelemetry(await telemetry.refresh());
}
void broadcastTelemetry();
setInterval(() => void broadcastTelemetry(), 1000);

// Host telemetry overrides (pause/resume, battery, occupancy) land inside
// the simulation — so they persist — and rebroadcast immediately.
hub.onTelemetryPatch((patch) => {
  telemetry.applyPatch(patch);
  telemetry.update();
  hub.emitTelemetry(telemetry.get());
});

// Watch connectivity → auto-switch to offline canned mode when the cloud drops.
startHealthMonitor(hub, llm);
// The deployables' reachability for the console's Services card.
const services = new ServicesMonitor(hub);
hub.setServiceRestarter((id) => services.restart(id));
services.start();

// Memory telemetry: one line per minute. A previous session died with a 4 GB
// heap OOM — if it ever grows again, this makes the climb (and its slope)
// visible in the log instead of ending in an unexplained crash.
setInterval(() => {
  const m = process.memoryUsage();
  const mb = (n: number) => Math.round(n / 1024 / 1024);
  // eslint-disable-next-line no-console
  console.log(
    `[mem] rss ${mb(m.rss)}MB heap ${mb(m.heapUsed)}/${mb(m.heapTotal)}MB ext ${mb(m.external)}MB | devices ${hub.connectedDevices}`,
  );
}, 60_000).unref();

// Route incoming user turns through the agent loop.
hub.onChat((chat) => {
  void agent.handleUserTurn(chat);
});

// Slit cards answered by the hub (themes, voices, sliders, the customizer)
// and the ↻ "say it again" affordance — no LLM round, but a spoken reply.
hub.onCardAnswer((p) => {
  void agent.handleCardAnswer(p);
});
hub.onLlmTest(() => agent.testLlm());
// Sessions belong to riders: a persona switch closes the old session's
// record; a card rider's consent decision is stored on the profile.
hub.onSessionEnd(({ sessionId, deviceId }) => agent.endSession(sessionId, deviceId));
hub.onConsentPersist((key, consent) => {
  personas.setConsentLocal(key, consent);
  void profiles.saveConsent(key, consent);
});
hub.setProfileResolvers((key) => personas.isPersistable(key), (key) => personas.get(key).consent);
hub.onRepeat((p) => {
  void agent.repeatLast(p);
});

// Barge-in: talk button pressed while a turn streams → abort that seat's turn
// (the kiosk silences its audio locally at the same moment).
hub.onInterrupt(({ deviceId }) => {
  agent.interrupt(deviceId);
});

// Host console inspector: deep view of one seat (live system prompt + turns).
hub.onInspect((deviceId) =>
  agent.inspect(deviceId, hub.sessionOf(deviceId), hub.seatPersonaKey(deviceId)),
);

// NFC scan → resolve the chip to a persona ("account") for that kiosk seat.
hub.onNfc(async ({ sessionId, deviceId, tagId, lang }) => {
  // A card tap supersedes whatever CoSiMo was still saying at this seat.
  agent.interrupt(deviceId);
  await personas.refresh();
  hub.broadcastPersonas();
  const key = personas.byNfcId(tagId);
  logger.log("nfc.scan", { tagId, persona: key }, { deviceId, sessionId, level: key ? "info" : "warn" });
  if (key) {
    hub.setPersonaForDevice(deviceId, key, "nfc");
    const newSession = hub.sessionOf(deviceId) || sessionId;
    const p = personas.get(key);
    // Greet in the rider's own preferred language — the card tells us who they
    // are, so the kiosk's UI toggle no longer has to guess.
    const riderLang = p.accommodations.language;
    // The greeting is where the profile becomes audible: name, language,
    // the rider's own pace — and the fact their style wants first.
    const ns = telemetry.get().nextStops[0];
    const text = greetingFor(p, ns ? { name: ns.name[riderLang], etaMinutes: ns.etaMinutes } : null);
    void agent.announce(newSession, text, riderLang, key, "happy");
  } else {
    const text =
      lang === "de"
        ? "Hmm, diese Karte kenne ich leider nicht. Frag gern das Standpersonal!"
        : "Hmm, I don't recognise this card. Please ask the booth staff!";
    void agent.announce(sessionId, text, lang, "default", "surprised");
  }
});

// Voice utterances → server STT → agent (voice modality).
hub.onVoice(async (v) => {
  try {
    const audio = Buffer.from(v.audioBase64, "base64");
    const t0 = Date.now();
    const text = await stt.transcribe(audio, v.mime, v.lang);
    const sttMs = Date.now() - t0;
    logger.log(
      "stt.result",
      { chars: text.length, durationMs: sttMs, mime: v.mime, bytes: audio.byteLength },
      { deviceId: v.deviceId, sessionId: v.sessionId, level: text ? "debug" : "warn" },
    );
    if (!text) return;
    hub.emitTranscript(v.sessionId, text, v.lang);
    void agent.handleUserTurn({
      sessionId: v.sessionId,
      deviceId: v.deviceId,
      text,
      lang: v.lang,
      persona: v.persona,
      modality: "voice",
    rider: v.rider,
      consent: v.consent,
      sttMs,
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
    model: operatorConfig.get().llm.model,
    llmProvider: operatorConfig.get().llm.provider,
    lightDriver: config.light.driver,
  });
});

httpServer.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[cosimo-realtime] listening on :${config.port}`);
  // The first system event of a process — a restart is visible in the log
  // as such, not just as a gap.
  logger.log("service.boot", {
    port: config.port,
    docker: existsSync("/.dockerenv"),
    llm: { provider: operatorConfig.get().llm.provider, model: operatorConfig.get().llm.model },
    light: config.light.driver,
    node: process.version,
  });
});
