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
  port: num("REALTIME_PORT", 4000),
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
    internalUrl: process.env.PAYLOAD_INTERNAL_URL ?? "http://localhost:3001",
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
    elevenLabsBaseUrl: process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io",
    // Low-latency model by default; eleven_turbo_v2_5 trades a little speed for
    // quality, eleven_multilingual_v2 is highest quality but slow.
    elevenLabsModel: process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5",
  },
  light: {
    driver: (process.env.LIGHT_DRIVER ?? "fake") as "fake" | "shelly",
    shellyBaseUrl: process.env.SHELLY_BASE_URL ?? "",
  },
  /** Allowed CORS origins: host console (3001), kiosk dev server (5173) and
   *  the native kiosk WebView. Override via CORS_ORIGINS in prod. */
  corsOrigins: (
    process.env.CORS_ORIGINS ??
    "http://localhost:3001,http://localhost:5173,capacitor://localhost"
  ).split(","),
} as const;
