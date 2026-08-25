/** Environment configuration for the realtime/agent service. */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Local dev: load the gitignored root .env.local (no-op in Docker, where env is
// injected by compose). Resolved relative to this file so cwd doesn't matter.
const rootEnvLocal = fileURLToPath(new URL("../../../.env.local", import.meta.url));
try {
  if (existsSync(rootEnvLocal)) process.loadEnvFile(rootEnvLocal);
} catch {
  // ignore — fall back to the ambient environment
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num("REALTIME_PORT", 6101),
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
  },
  /** LLM endpoint routing defaults; the operator-config global can override
   *  provider/baseUrl/model at runtime. Keys stay env-only. */
  llm: {
    provider: (process.env.LLM_PROVIDER ?? "anthropic") as "anthropic" | "openai-compatible",
    /** Empty = provider default (api.anthropic.com / none for openai-compatible). */
    baseUrl: process.env.LLM_BASE_URL ?? "",
    /** Bearer token for an openai-compatible endpoint, if it needs one. */
    apiKey: process.env.LLM_API_KEY ?? "",
  },
  payload: {
    internalUrl: process.env.PAYLOAD_INTERNAL_URL ?? "http://localhost:6100",
    apiKey: process.env.PAYLOAD_API_KEY ?? "",
    /** Shared secret authorizing server-to-server writes to the CMS. */
    internalKey: process.env.PAYLOAD_INTERNAL_KEY ?? "",
  },
  speech: {
    deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? "",
    deepgramModel: process.env.DEEPGRAM_MODEL ?? "nova-2",
    deepgramBaseUrl: process.env.DEEPGRAM_BASE_URL ?? "https://api.deepgram.com",
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
    elevenLabsVoiceIdMale: process.env.ELEVENLABS_VOICE_ID_MALE ?? "",
    elevenLabsBaseUrl: process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io",
    // Low-latency model by default; eleven_turbo_v2_5 trades a little speed for
    // quality, eleven_multilingual_v2 is highest quality but slow.
    elevenLabsModel: process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5",
  },
  light: {
    driver: (process.env.LIGHT_DRIVER ?? "fake") as "fake" | "shelly",
    shellyBaseUrl: process.env.SHELLY_BASE_URL ?? "",
  },
  /** Cabin DMX controller (Cuety LPU-2). Reached by the KIOSKS on the cabin
   *  LAN, never by this service — the cabin network has no uplink and the
   *  hub may well run on the VPS. Base URL + playback mapping are also
   *  CMS-editable (operator-config), because they change on mounting day. */
  lpu2: {
    baseUrl: process.env.LPU2_BASE_URL ?? "",
    timeoutMs: num("LPU2_TIMEOUT_MS", 2500),
  },
  /** The structured debug log (see log/logger.ts). `dir` relative to the
   *  realtime package; empty = no file (buffer + live stream only).
   *  `transcripts` is the one GDPR switch: off blanks visitor/CoSiMo text. */
  log: {
    dir: process.env.LOG_DIR ?? "logs",
    keepDays: num("LOG_KEEP_DAYS", 14),
    bufferSize: num("LOG_BUFFER", 5_000),
    transcripts: (process.env.LOG_TRANSCRIPTS ?? "true") !== "false",
  },
  /** Face behaviour: expressive emotions fade back to neutral, and a seat
   *  with no interaction drifts to the sleeping attract face. */
  face: {
    emotionDecayMs: num("FACE_EMOTION_DECAY_MS", 10_000),
    idleSleepMs: num("FACE_IDLE_SLEEP_MS", 120_000),
  },
  /** Allowed CORS origins: cms (6100), console dev (6102), emulator dev
   *  (6103), journey dev (6104) and the native kiosk WebView. Override via
   *  CORS_ORIGINS in prod. */
  /** Operator password for consoles (hello token = its SHA-256). Empty = no
   *  check (dev only — the hub warns at boot). */
  hostToken: process.env.HOST_TOKEN ?? "",
  /** docker-socket-proxy (restart-only) for the console's restart buttons; empty = disabled. */
  dockerProxyUrl: process.env.DOCKER_PROXY_URL ?? "",
  corsOrigins: (
    process.env.CORS_ORIGINS ??
    "http://localhost:6100,http://localhost:6102,http://localhost:6103,http://localhost:6104,capacitor://localhost"
  ).split(","),
} as const;
