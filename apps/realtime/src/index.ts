/**
 * CoSiMo realtime/agent service — Phase 0 skeleton.
 *
 * Express HTTP (health) + Socket.IO hub that will, in later phases, run the
 * Claude agent loop, STT/TTS, the cabin light routing, telemetry, the persona
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
import { ConfigSink } from "./agent/configSink.js";
import { PersonaProvider } from "./agent/personas.js";
import { TelemetrySimulation } from "./agent/telemetry.js";
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
hub.setDefaultConsent(config.consentDefault);
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
void operatorConfig.refresh().then(() => { hub.broadcastConfig(); hub.setLightScenes(operatorConfig.get().cabin.scenes); });
// Keep the console's routing view honest: re-read on the provider's TTL
// even when no turn is running, and push only if something changed.
setInterval(() => void operatorConfig.refresh().then(() => { hub.broadcastConfig(); hub.setLightScenes(operatorConfig.get().cabin.scenes); }), 15_000);

// "als Szene speichern" from the console: the cabin's current levels become
// the scene, written back to the CMS and re-read so every seat gets the list.
const configSink = new ConfigSink();
hub.onSceneSave(async (req, groups, scenes) => {
  const next = scenes.map((s) => (s.key === req.key
    ? { ...s, label: req.label?.trim() || s.label, groups: req.keepLevels ? s.groups : { roofline: { ...groups.roofline }, rooflight: { ...groups.rooflight }, floor: { ...groups.floor } } }
    : s));
  if (!next.some((s) => s.key === req.key)) return null;
  const ok = await configSink.saveScenes(next);
  if (ok) {
    operatorConfig.invalidate();
    await operatorConfig.refresh();
    return operatorConfig.get().cabin.scenes;
  }
  return next; // CMS unreachable: keep it in memory for this run
});
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

// Host telemetry overrides (pause/resume, occupancy, faults) land inside
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

// The settings menu in the slit: every tap is applied by the hub itself —
// no LLM round, but a short spoken confirmation in the new setting.
hub.onSettingsPatch((p) => {
  void agent.handleSettingsPatch(p);
});
hub.onLlmTest(() => agent.testLlm());
// Console "Testen" on the speech cards. TTS: one sentence on the live route,
// audio returned for playback. STT: that sentence synthesized, then
// recognized — a real round-trip without a microphone in the loop.
const TEST_SENTENCE = "Funktionstest: eins, zwei, drei.";
hub.onSpeechTest(async (kind, opts) => {
  const cfg = operatorConfig.get();
  const route = kind === "tts" ? cfg.tts.baseUrl : cfg.stt.baseUrl;
  const model = kind === "tts" ? cfg.tts.model : cfg.stt.model;
  const fail = (error: string, ms = 0) => ({ ok: false, route, model, ms, error });
  if (!tts.available) return fail(kind === "tts" ? "kein Server-TTS (ELEVENLABS_API_KEY fehlt)" : "kein Server-TTS für das Testaudio");
  try {
    const t0 = Date.now();
    const entry = opts?.voice ? cfg.tts.voices.find((v) => v.key === opts.voice) : undefined;
    if (opts?.voice && !entry) return fail(`Stimme „${opts.voice}“ nicht im Katalog`);
    const audio = await tts.synthesize(TEST_SENTENCE, "de", { rate: 1, gender: entry?.gender ?? "female", tone: "neutral", voiceKey: entry?.key });
    const ttsMs = Date.now() - t0;
    if (!audio) return fail("keine Audioantwort", ttsMs);
    const buf = Buffer.from(audio.audioBase64, "base64");
    if (kind === "tts") return { ok: true, voice: entry?.key ?? "default", route, model, ms: ttsMs, text: TEST_SENTENCE, bytes: buf.byteLength, audioBase64: audio.audioBase64, mime: audio.mime };
    if (!stt.available) return fail("kein Server-STT (DEEPGRAM_API_KEY fehlt) — die iPads diktieren lokal");
    const t1 = Date.now();
    const text = await stt.transcribe(buf, audio.mime, "de");
    const ms = Date.now() - t1;
    return { ok: text.trim().length > 0, route, model, ms, text: text.trim() || undefined, bytes: buf.byteLength, error: text.trim() ? undefined : "leeres Transkript" };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
});
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
    node: process.version,
  });
});
