/**
 * Operator-config provider. Endpoint routing (LLM/STT/TTS base URLs, models)
 * is hand-edited in Payload's config globals (agent · llm · speech · voices · cabin); this provider fetches
 * it on a short TTL and merges it over the env defaults, so an admin edit
 * takes effect on the next turn without a redeploy. API keys never come from
 * the CMS — they stay in the environment.
 */

import { config } from "../config.js";
import { logger } from "../log/logger.js";
import { buildHostLight, type Lpu2Mapping } from "../cabin/lpu2.js";
import { CABIN_CONTROLS, LPU2_KEYS, DEFAULT_INFO_QUESTION, DEFAULT_KNOWLEDGE, type KnowledgeEntry, type Locale, type HostConfigBroadcast, type LlmGeneration, type VoiceCatalogEntry,
  DEFAULT_LIGHT_SCENES,
  rowToScene,
  type LightScene,
  type SceneRow,
} from "@cosimo/shared";

/** Today's effective values (Qwen generation_config + our max_tokens). */
export const DEFAULT_GENERATION: LlmGeneration = { temperature: 0.7, topP: 0.8, maxTokens: 1024, repetitionPenalty: 1.0, thinking: false };
/** Empty CMS field (null/undefined/"") = default; anything else is clamped. */
const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number => {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export type LlmProviderKind = "anthropic" | "openai-compatible";

export interface ResolvedOperatorConfig {
  /** Core system prompt override; empty = the built-in default in prompt.ts;
   *  the info button's question per language. */
  agent: { systemPrompt: string; infoQuestion: Record<Locale, string> };
  /** The fact sheet (CMS collection `knowledge`, active rows in order; empty = the built-in defaults). */
  knowledge: KnowledgeEntry[];
  llm: {
    provider: LlmProviderKind;
    baseUrl: string;
    model: string;
    /** Used when the primary is unreachable (probe); null = canned on outage. */
    fallback: { provider: LlmProviderKind; baseUrl: string; model: string } | null;
    generation: LlmGeneration;
    /** Force the matching tool on clear light / settings / memory sentences (CMS switch, default off). */
    toolForcing: boolean;
  };
  stt: { baseUrl: string; model: string };
  tts: { baseUrl: string; voiceId: string; voiceIdMale: string; model: string; voices: VoiceCatalogEntry[] };
  /** Cabin lighting: where the LPU-2 lives on the cabin LAN and which
   *  playback drives which control. Unmapped controls stay simulated. */
  cabin: { lpu2BaseUrl: string; lpu2Mapping: Lpu2Mapping; lpu2TimeoutMs: number; scenes: LightScene[] };
}

function envDefaults(): ResolvedOperatorConfig {
  return {
    agent: { systemPrompt: "", infoQuestion: { ...DEFAULT_INFO_QUESTION } },
    knowledge: [...DEFAULT_KNOWLEDGE],
    llm: {
      provider: config.llm.provider,
      baseUrl: config.llm.baseUrl,
      model: config.anthropic.model,
      fallback: null,
      generation: { ...DEFAULT_GENERATION },
      toolForcing: false,
    },
    stt: {
      baseUrl: config.speech.deepgramBaseUrl,
      model: config.speech.deepgramModel,
    },
    tts: {
      baseUrl: config.speech.elevenLabsBaseUrl,
      voiceId: config.speech.elevenLabsVoiceId,
      voiceIdMale: config.speech.elevenLabsVoiceIdMale,
      model: config.speech.elevenLabsModel,
      voices: [],
    },
    cabin: {
      lpu2BaseUrl: config.lpu2.baseUrl,
      lpu2Mapping: {},
      lpu2TimeoutMs: config.lpu2.timeoutMs,
      scenes: DEFAULT_LIGHT_SCENES,
    },
  };
}

/** The CMS scene rows → scenes; empty/junk → the built-in three. */
function toScenes(rows: SceneRow[]): LightScene[] {
  const out: LightScene[] = [];
  for (const r of rows) {
    const base = DEFAULT_LIGHT_SCENES.find((s) => s.key === String(r.key ?? "").trim().toLowerCase()) ?? DEFAULT_LIGHT_SCENES[0]!;
    const sc = rowToScene(r, base);
    if (sc && !out.some((s) => s.key === sc.key)) out.push(sc);
  }
  return out.length ? out : DEFAULT_LIGHT_SCENES;
}

const MAPPING_KEYS = new Set<string>(LPU2_KEYS.map((k) => k.key));

/** Read the CMS playback rows into a mapping, ignoring junk rows. */
function toMapping(rows: { control?: string | null; playback?: number | null; cues?: { scene?: string | null; cue?: number | null }[] | null }[]): Lpu2Mapping {
  const mapping: Lpu2Mapping = {};
  for (const row of rows) {
    const control = row.control ?? "";
    const pb = row.playback ?? 0;
    // Out-of-range playbacks would address a fixture that isn't there;
    // unknown keys are stray rows (the catalog lives in shared cabin.ts).
    if (!MAPPING_KEYS.has(control) || !Number.isInteger(pb) || pb < 1 || pb > 64) continue;
    mapping[control] = { playback: pb };
  }
  return mapping;
}

/** Shape of the Payload global we care about (all fields optional). */
interface PayloadOperatorConfigDoc {
  agent?: { systemPrompt?: string | null; infoQuestionDe?: string | null; infoQuestionEn?: string | null };
  llm?: {
    provider?: string;
    baseUrl?: string | null;
    model?: string | null;
    fallbackProvider?: string | null;
    fallbackBaseUrl?: string | null;
    fallbackModel?: string | null;
    generation?: { temperature?: number | null; topP?: number | null; maxTokens?: number | null; repetitionPenalty?: number | null; thinking?: boolean | null } | null;
    toolForcing?: boolean | null;
  };
  stt?: { baseUrl?: string | null; model?: string | null };
  tts?: {
    baseUrl?: string | null;
    voiceId?: string | null;
    voiceIdMale?: string | null;
    model?: string | null;
    voices?: { key?: string | null; label?: string | null; voiceId?: string | null; gender?: string | null; language?: string | null; description?: string | null }[] | null;
  };
  cabin?: {
    lpu2BaseUrl?: string | null;
    lpu2Playbacks?: { control?: string | null; playback?: number | null; cues?: { scene?: string | null; cue?: number | null }[] | null }[] | null;
    lightScenes?: SceneRow[] | null;
  };
}

const str = (v: string | null | undefined, fallback: string): string =>
  v && v.trim() ? v.trim() : fallback;

export class OperatorConfigProvider {
  private cache: ResolvedOperatorConfig = envDefaults();
  private lastFetch = 0;
  private readonly ttlMs = 15_000;
  /** When the CMS copy was last loaded successfully; null = still on env defaults. */
  private loadedAt: string | null = null;

  /** Current resolved config (cached, env defaults applied). Never throws. */
  get(): ResolvedOperatorConfig {
    return this.cache;
  }

  /** Forget the TTL so the next refresh() really fetches (after a write-back). */
  invalidate(): void {
    this.lastFetch = 0;
  }

  /** Fingerprint of what the hub routes to; a change is a system event. */
  private lastFingerprint: Record<string, string> | null = null;
  private logIfChanged(source: "cms" | "defaults"): void {
    const c = this.cache;
    const fp: Record<string, string> = {
      llm: `${c.llm.provider} · ${c.llm.model} @ ${c.llm.baseUrl}`,
      generation: JSON.stringify(c.llm.generation),
      fallback: c.llm.fallback ? `${c.llm.fallback.provider} · ${c.llm.fallback.model}` : "—",
      stt: `${c.stt.model} @ ${c.stt.baseUrl}`,
      tts: `${c.tts.model} · voice ${c.tts.voiceId}/${c.tts.voiceIdMale || "—"} · ${c.tts.voices.length} voices`,
      lpu2: `${c.cabin.lpu2BaseUrl || "—"} · ${Object.keys(c.cabin.lpu2Mapping).length} mapped`,
      prompt: `${c.agent.systemPrompt.length} chars`,
    };
    const changed = Object.keys(fp).filter((k) => this.lastFingerprint?.[k] !== fp[k]);
    if (this.lastFingerprint && changed.length === 0) return;
    this.lastFingerprint = fp;
    logger.log("config.loaded", {
      source,
      llm: fp.llm!,
      fallback: c.llm.fallback ? fp.fallback! : null,
      voices: c.tts.voices.length,
      lpu2Mapped: Object.keys(c.cabin.lpu2Mapping).length,
      changed,
    });
  }

  /** The routing as the operator console shows it — URLs and models, no keys. */
  toBroadcast(): HostConfigBroadcast {
    const c = this.cache;
    return {
      source: this.loadedAt ? "cms" : "defaults",
      loadedAt: this.loadedAt,
      llm: { provider: c.llm.provider, baseUrl: c.llm.baseUrl, model: c.llm.model, fallback: c.llm.fallback ? { ...c.llm.fallback } : null, generation: { ...c.llm.generation } },
      stt: { baseUrl: c.stt.baseUrl, model: c.stt.model },
      tts: { baseUrl: c.tts.baseUrl, model: c.tts.model, voices: c.tts.voices.length, voiceList: c.tts.voices.map((v) => ({ key: v.key, label: v.label, gender: v.gender })) },
      cabin: {
        lpu2BaseUrl: c.cabin.lpu2BaseUrl,
        mapped: Object.keys(c.cabin.lpu2Mapping).length,
        controls: CABIN_CONTROLS.length,
        timeoutMs: c.cabin.lpu2TimeoutMs,
        routes: LPU2_KEYS.map((k) => {
          const lpu2 = { baseUrl: c.cabin.lpu2BaseUrl, mapping: c.cabin.lpu2Mapping, timeoutMs: c.cabin.lpu2TimeoutMs };
          // urls[0] is the key's own playback command (a sibling release may follow it).
          return {
            key: k.key,
            label: k.label,
            group: k.group,
            playback: c.cabin.lpu2Mapping[k.key]?.playback ?? null,
            on: buildHostLight(k.key, true, lpu2)?.urls[0] ?? null,
            off: buildHostLight(k.key, false, lpu2)?.urls[0] ?? null,
          };
        }),
      },
      systemPrompt: c.agent.systemPrompt,
      infoQuestion: { ...c.agent.infoQuestion },
      tools: [],
    };
  }

  /** Refresh from Payload, merging over env defaults. Best-effort. */
  async refresh(): Promise<ResolvedOperatorConfig> {
    const now = Date.now();
    if (now - this.lastFetch < this.ttlMs) return this.cache;
    this.lastFetch = now;
    try {
      // Five globals (agent · llm · speech · voices · cabin), read together and
      // merged into one document shape — field names are the same as before
      // the split, so the parsing below did not change.
      const get = async <T,>(slug: string): Promise<T | null> => {
        const res = await fetch(`${config.payload.internalUrl}/api/globals/${slug}`, { signal: AbortSignal.timeout(2500) });
        return res.ok ? ((await res.json()) as T) : null;
      };
      // the fact sheet: active rows in order; null when the CMS cannot answer
      const getKnowledge = async (): Promise<KnowledgeEntry[] | null> => {
        const res = await fetch(`${config.payload.internalUrl}/api/knowledge?limit=200&depth=0&sort=order&where[active][equals]=true`, { signal: AbortSignal.timeout(2500) });
        if (!res.ok) return null;
        const body = (await res.json()) as { docs?: { topic?: string; title?: string | null; body?: string | null }[] };
        return (body.docs ?? [])
          .filter((d) => d.title?.trim() && d.body?.trim())
          .map((d) => ({ topic: d.topic === "cosimo" ? "cosimo" : "monocab", title: d.title!.trim(), body: d.body!.trim() }));
      };
      const [agent, llm, speech, voices, cabin, knowledge] = await Promise.all([
        get<PayloadOperatorConfigDoc["agent"]>("agent-config"),
        get<PayloadOperatorConfigDoc["llm"]>("llm-config"),
        get<{ stt?: PayloadOperatorConfigDoc["stt"]; tts?: Omit<NonNullable<PayloadOperatorConfigDoc["tts"]>, "voices"> }>("speech-config"),
        get<{ voices?: NonNullable<PayloadOperatorConfigDoc["tts"]>["voices"] }>("voices"),
        get<PayloadOperatorConfigDoc["cabin"]>("cabin-config"),
        getKnowledge(),
      ]);
      if (!llm) return this.cache; // the CMS is down (the LLM route is the one that must not be guessed)
      const doc: PayloadOperatorConfigDoc = {
        agent: agent ?? undefined,
        llm,
        stt: speech?.stt,
        tts: { ...(speech?.tts ?? {}), voices: voices?.voices ?? [] },
        cabin: cabin ?? undefined,
      };
      const base = envDefaults();
      this.cache = {
        knowledge: knowledge && knowledge.length ? knowledge : [...DEFAULT_KNOWLEDGE],
        agent: {
          systemPrompt: str(doc.agent?.systemPrompt, base.agent.systemPrompt),
          infoQuestion: { de: str(doc.agent?.infoQuestionDe, base.agent.infoQuestion.de), en: str(doc.agent?.infoQuestionEn, base.agent.infoQuestion.en) },
        },
        llm: {
          provider:
            doc.llm?.provider === "openai-compatible" || doc.llm?.provider === "anthropic"
              ? doc.llm.provider
              : base.llm.provider,
          baseUrl: str(doc.llm?.baseUrl, base.llm.baseUrl),
          model: str(doc.llm?.model, base.llm.model),
          fallback:
            doc.llm?.fallbackProvider === "anthropic" || doc.llm?.fallbackProvider === "openai-compatible"
              ? {
                  provider: doc.llm.fallbackProvider,
                  baseUrl: str(doc.llm.fallbackBaseUrl, ""),
                  // Anthropic falls back to the env model; an OpenAI endpoint
                  // needs its model named.
                  model: str(doc.llm.fallbackModel, doc.llm.fallbackProvider === "anthropic" ? config.anthropic.model : ""),
                }
              : null,
          toolForcing: doc.llm?.toolForcing === true,
          generation: {
            temperature: clampNum(doc.llm?.generation?.temperature, 0.1, 1, DEFAULT_GENERATION.temperature),
            topP: clampNum(doc.llm?.generation?.topP, 0.5, 1, DEFAULT_GENERATION.topP),
            maxTokens: Math.round(clampNum(doc.llm?.generation?.maxTokens, 128, 2048, DEFAULT_GENERATION.maxTokens)),
            repetitionPenalty: clampNum(doc.llm?.generation?.repetitionPenalty, 1, 1.3, DEFAULT_GENERATION.repetitionPenalty),
            thinking: doc.llm?.generation?.thinking === true,
          },
        },
        stt: {
          baseUrl: str(doc.stt?.baseUrl, base.stt.baseUrl),
          model: str(doc.stt?.model, base.stt.model),
        },
        tts: {
          baseUrl: str(doc.tts?.baseUrl, base.tts.baseUrl),
          voiceId: str(doc.tts?.voiceId, base.tts.voiceId),
          voiceIdMale: str(doc.tts?.voiceIdMale, base.tts.voiceIdMale),
          model: str(doc.tts?.model, base.tts.model),
          voices: (doc.tts?.voices ?? [])
            .map((v) => ({
              key: str(v.key, "").toLowerCase(),
              label: str(v.label, str(v.key, "")),
              voiceId: str(v.voiceId, ""),
              gender: v.gender === "male" ? ("male" as const) : ("female" as const),
              language: v.language === "en" ? ("en" as const) : ("de" as const),
              description: str(v.description, ""),
            }))
            .filter((v) => v.key && v.voiceId),
        },
        cabin: {
          lpu2BaseUrl: str(doc.cabin?.lpu2BaseUrl, base.cabin.lpu2BaseUrl),
          lpu2Mapping: toMapping(doc.cabin?.lpu2Playbacks ?? []),
          lpu2TimeoutMs: base.cabin.lpu2TimeoutMs,
          scenes: toScenes(doc.cabin?.lightScenes ?? []),
        },
      };
      this.loadedAt = new Date().toISOString();
      this.logIfChanged("cms");
    } catch {
      // Payload down — keep defaults / last-known.
    }
    return this.cache;
  }
}
