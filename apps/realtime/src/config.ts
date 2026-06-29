/** Environment configuration for the realtime/agent service. */

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
  },
  speech: {
    sttProvider: process.env.STT_PROVIDER ?? "mock",
    ttsProvider: process.env.TTS_PROVIDER ?? "mock",
  },
  light: {
    driver: (process.env.LIGHT_DRIVER ?? "fake") as "fake" | "shelly",
    shellyBaseUrl: process.env.SHELLY_BASE_URL ?? "",
  },
  /** Allowed CORS origins for the PWA + host console (dev defaults). */
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
} as const;
