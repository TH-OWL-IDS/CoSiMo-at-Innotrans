/**
 * Operator-config provider. Endpoint routing (LLM/STT/TTS base URLs, models)
 * is hand-edited in Payload's `operator-config` global; this provider fetches
 * it on a short TTL and merges it over the env defaults, so an admin edit
 * takes effect on the next turn without a redeploy. API keys never come from
 * the CMS — they stay in the environment.
 */

import { config } from "../config.js";
import type { Lpu2Mapping } from "../cabin/lpu2.js";
import { CABIN_CONTROLS, type CabinControlId } from "@cosimo/shared";

export type LlmProviderKind = "anthropic" | "openai-compatible";

export interface ResolvedOperatorConfig {
  /** Core system prompt override; empty = the built-in default in prompt.ts. */
  agent: { systemPrompt: string };
  llm: { provider: LlmProviderKind; baseUrl: string; model: string };
  stt: { baseUrl: string; model: string };
  tts: { baseUrl: string; voiceId: string; model: string };
  /** Cabin lighting: where the LPU-2 lives on the cabin LAN and which
   *  playback drives which control. Unmapped controls stay simulated. */
  cabin: { lpu2BaseUrl: string; lpu2Mapping: Lpu2Mapping; lpu2TimeoutMs: number };
}

function envDefaults(): ResolvedOperatorConfig {
  return {
    agent: { systemPrompt: "" },
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
    cabin: {
      lpu2BaseUrl: config.lpu2.baseUrl,
      lpu2Mapping: {},
      lpu2TimeoutMs: config.lpu2.timeoutMs,
    },
  };
}

const CONTROL_IDS = new Set<string>(CABIN_CONTROLS.map((c) => c.id));

/** Read the CMS playback rows into a mapping, ignoring junk rows. */
function toMapping(rows: { control?: string | null; playback?: number | null }[]): Lpu2Mapping {
  const mapping: Lpu2Mapping = {};
  for (const row of rows) {
    const control = row.control ?? "";
    const pb = row.playback ?? 0;
    // Out-of-range playbacks would address a fixture that isn't there.
    if (!CONTROL_IDS.has(control) || !Number.isInteger(pb) || pb < 1 || pb > 64) continue;
    mapping[control as CabinControlId] = pb;
  }
  return mapping;
}

/** Shape of the Payload global we care about (all fields optional). */
interface PayloadOperatorConfigDoc {
  agent?: { systemPrompt?: string | null };
  llm?: { provider?: string; baseUrl?: string | null; model?: string | null };
  stt?: { baseUrl?: string | null; model?: string | null };
  tts?: { baseUrl?: string | null; voiceId?: string | null; model?: string | null };
  cabin?: {
    lpu2BaseUrl?: string | null;
    lpu2Playbacks?: { control?: string | null; playback?: number | null }[] | null;
  };
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
        agent: { systemPrompt: str(doc.agent?.systemPrompt, base.agent.systemPrompt) },
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
        cabin: {
          lpu2BaseUrl: str(doc.cabin?.lpu2BaseUrl, base.cabin.lpu2BaseUrl),
          lpu2Mapping: toMapping(doc.cabin?.lpu2Playbacks ?? []),
          lpu2TimeoutMs: base.cabin.lpu2TimeoutMs,
        },
      };
    } catch {
      // Payload down — keep defaults / last-known.
    }
    return this.cache;
  }
}
