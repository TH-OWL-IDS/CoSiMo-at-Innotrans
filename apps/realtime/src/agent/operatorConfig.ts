/**
 * Operator-config provider. Endpoint routing (LLM/STT/TTS base URLs, models)
 * is hand-edited in Payload's `operator-config` global; this provider fetches
 * it on a short TTL and merges it over the env defaults, so an admin edit
 * takes effect on the next turn without a redeploy. API keys never come from
 * the CMS — they stay in the environment.
 */

import { config } from "../config.js";

export type LlmProviderKind = "anthropic" | "openai-compatible";

export interface ResolvedOperatorConfig {
  llm: { provider: LlmProviderKind; baseUrl: string; model: string };
  stt: { baseUrl: string; model: string };
  tts: { baseUrl: string; voiceId: string; model: string };
}

function envDefaults(): ResolvedOperatorConfig {
  return {
    llm: {
      provider: config.llm.provider,
      baseUrl: config.llm.baseUrl,
      model: config.anthropic.model,
    },
    stt: {
      baseUrl: config.speech.deepgramBaseUrl,
      model: config.speech.deepgramModel,
    },
    tts: {
      baseUrl: config.speech.elevenLabsBaseUrl,
      voiceId: config.speech.elevenLabsVoiceId,
      model: config.speech.elevenLabsModel,
    },
  };
}

/** Shape of the Payload global we care about (all fields optional). */
interface PayloadOperatorConfigDoc {
  llm?: { provider?: string; baseUrl?: string | null; model?: string | null };
  stt?: { baseUrl?: string | null; model?: string | null };
  tts?: { baseUrl?: string | null; voiceId?: string | null; model?: string | null };
}

const str = (v: string | null | undefined, fallback: string): string =>
  v && v.trim() ? v.trim() : fallback;

export class OperatorConfigProvider {
  private cache: ResolvedOperatorConfig = envDefaults();
  private lastFetch = 0;
  private readonly ttlMs = 15_000;

  /** Current resolved config (cached, env defaults applied). Never throws. */
  get(): ResolvedOperatorConfig {
    return this.cache;
  }

  /** Refresh from Payload, merging over env defaults. Best-effort. */
  async refresh(): Promise<ResolvedOperatorConfig> {
    const now = Date.now();
    if (now - this.lastFetch < this.ttlMs) return this.cache;
    this.lastFetch = now;
    try {
      const url = `${config.payload.internalUrl}/api/globals/operator-config`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return this.cache;
      const doc = (await res.json()) as PayloadOperatorConfigDoc;
      const base = envDefaults();
      this.cache = {
        llm: {
          provider:
            doc.llm?.provider === "openai-compatible" || doc.llm?.provider === "anthropic"
              ? doc.llm.provider
              : base.llm.provider,
          baseUrl: str(doc.llm?.baseUrl, base.llm.baseUrl),
          model: str(doc.llm?.model, base.llm.model),
        },
        stt: {
          baseUrl: str(doc.stt?.baseUrl, base.stt.baseUrl),
          model: str(doc.stt?.model, base.stt.model),
        },
        tts: {
          baseUrl: str(doc.tts?.baseUrl, base.tts.baseUrl),
          voiceId: str(doc.tts?.voiceId, base.tts.voiceId),
          model: str(doc.tts?.model, base.tts.model),
        },
      };
    } catch {
      // Payload down — keep defaults / last-known.
    }
    return this.cache;
  }
}
