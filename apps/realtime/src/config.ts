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
  payload: {
    internalUrl: process.env.PAYLOAD_INTERNAL_URL ?? "http://localhost:3000",
    apiKey: process.env.PAYLOAD_API_KEY ?? "",
    /** Shared secret authorizing server-to-server writes to the CMS. */
    internalKey: process.env.PAYLOAD_INTERNAL_KEY ?? "",
  },
  speech: {
    deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? "",
    deepgramModel: process.env.DEEPGRAM_MODEL ?? "nova-2",
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
  },
  light: {
    driver: (process.env.LIGHT_DRIVER ?? "fake") as "fake" | "shelly",
    shellyBaseUrl: process.env.SHELLY_BASE_URL ?? "",
  },
  /** Allowed CORS origins for the PWA + host console (dev defaults). */
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
} as const;
