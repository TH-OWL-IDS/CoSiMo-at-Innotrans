/**
 * Persona provider. Personas are hand-authored in Payload's `personas`
 * collection; this provider fetches them, merges over built-in defaults, and
 * caches the result on a short TTL. The defaults double as the seed values and
 * keep the demo working when Payload is unreachable.
 *
 * A persona shapes two things: the agent's support style + emotional bias (used
 * server-side in the system prompt) and the client presentation (theme, contrast,
 * large text — broadcast to the iPads as a PersonaBroadcast).
 */

import type {
  Persona,
  PersonaBroadcast,
  PersonaKey,
} from "@cosimo/shared";
import { config } from "../config.js";

/** Built-in defaults — also the values to seed into Payload. */
export const DEFAULT_PERSONAS: Record<PersonaKey, Persona> = {
  default: {
    key: "default",
    label: { de: "Standard", en: "Default" },
    summary: { de: "Allgemeine Begleitung.", en: "General assistance." },
    supportStyle: "Speak naturally and warmly. Keep answers short and clear.",
    emotionBias: { happy: 0.3, neutral: 0.2 },
    preferredModality: "both",
    themeId: "classic",
    presentation: { highContrast: false, largeText: false, speakAloud: true },
  },
  "eyes-free": {
    key: "eyes-free",
    label: { de: "Ohne Sicht", en: "Eyes-free" },
    summary: {
      de: "Für blinde oder sehbeeinträchtigte Fahrgäste.",
      en: "For blind or low-vision riders.",
    },
    supportStyle:
      "The rider may not be looking at the screen. Be fully understandable by ear alone: lead with the answer, avoid references to on-screen elements ('as you can see'), spell out anything a screen would show, and confirm every action aloud.",
    emotionBias: { neutral: 0.4, happy: 0.2 },
    preferredModality: "voice",
    themeId: "night",
    presentation: { highContrast: true, largeText: true, speakAloud: true },
  },
  wheelchair: {
    key: "wheelchair",
    label: { de: "Rollstuhl", en: "Wheelchair" },
    summary: {
      de: "Fokus auf barrierefreien Zugang.",
      en: "Focus on step-free access.",
    },
    supportStyle:
      "Pay attention to step-free access, the wheelchair space, door width and boarding help. Proactively mention accessibility details when relevant to the rider's question.",
    emotionBias: { happy: 0.3, neutral: 0.2 },
    preferredModality: "both",
    themeId: "ocean",
    presentation: { highContrast: false, largeText: true, speakAloud: true },
  },
  "text-first": {
    key: "text-first",
    label: { de: "Text", en: "Text-first" },
    summary: {
      de: "Für gehörlose oder text-bevorzugende Fahrgäste.",
      en: "For deaf or text-preferring riders.",
    },
    supportStyle:
      "The rider prefers reading. Write in clear, well-structured text. Do not rely on tone of voice; make confirmations explicit in writing.",
    emotionBias: { neutral: 0.3, happy: 0.2 },
    preferredModality: "text",
    themeId: "slate",
    presentation: { highContrast: false, largeText: true, speakAloud: false },
  },
};

/** Shape of a Payload `personas` doc we care about. */
interface PayloadPersonaDoc {
  key?: PersonaKey;
  labelDe?: string;
  labelEn?: string;
  summaryDe?: string;
  summaryEn?: string;
  supportStyle?: string;
  preferredModality?: Persona["preferredModality"];
  themeId?: string;
  emotionBias?: Partial<Record<"happy" | "sad" | "surprised" | "neutral", number>>;
  presentation?: Partial<Persona["presentation"]>;
  /** NFC chip ids that "log in" as this persona (array field in Payload). */
  nfcIds?: { id?: string; tag?: string }[];
}

function mergeDoc(base: Persona, doc: PayloadPersonaDoc): Persona {
  return {
    ...base,
    label: { de: doc.labelDe ?? base.label.de, en: doc.labelEn ?? base.label.en },
    summary: { de: doc.summaryDe ?? base.summary.de, en: doc.summaryEn ?? base.summary.en },
    supportStyle: doc.supportStyle ?? base.supportStyle,
    preferredModality: doc.preferredModality ?? base.preferredModality,
    themeId: doc.themeId ?? base.themeId,
    emotionBias: doc.emotionBias ?? base.emotionBias,
    presentation: { ...base.presentation, ...(doc.presentation ?? {}) },
  };
}

export class PersonaProvider {
  private cache: Record<PersonaKey, Persona> = { ...DEFAULT_PERSONAS };
  private nfcIndex = new Map<string, PersonaKey>();
  private lastFetch = 0;
  private readonly ttlMs = 15_000;

  /** Resolve an NFC chip id to its persona ("account"), or null. */
  byNfcId(tagId: string): PersonaKey | null {
    return this.nfcIndex.get(tagId.trim()) ?? null;
  }

  /** Resolve a persona (cached, defaults applied). Never throws. */
  get(key: PersonaKey): Persona {
    return this.cache[key] ?? DEFAULT_PERSONAS.default;
  }

  /** The client-facing slice for broadcasting. */
  toBroadcast(key: PersonaKey): PersonaBroadcast {
    const p = this.get(key);
    return { persona: p.key, label: p.label, themeId: p.themeId, presentation: p.presentation };
  }

  /** Refresh personas from Payload, merging over the built-in defaults. */
  async refresh(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFetch < this.ttlMs) return;
    this.lastFetch = now;
    try {
      const url = `${config.payload.internalUrl}/api/personas?limit=50`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return;
      const body = (await res.json()) as { docs?: PayloadPersonaDoc[] };
      const next: Record<PersonaKey, Persona> = { ...DEFAULT_PERSONAS };
      const nfc = new Map<string, PersonaKey>();
      for (const doc of body.docs ?? []) {
        if (!doc.key || !next[doc.key]) continue;
        next[doc.key] = mergeDoc(next[doc.key], doc);
        for (const row of doc.nfcIds ?? []) {
          const tag = (row.tag ?? row.id ?? "").trim();
          if (tag) nfc.set(tag, doc.key);
        }
      }
      this.cache = next;
      this.nfcIndex = nfc;
    } catch {
      // Payload down — keep defaults / last-known.
    }
  }
}

/** Turn an emotion bias into a one-line prompt instruction. */
export function emotionBiasSentence(p: Persona): string {
  const bias = p.emotionBias;
  const top = (Object.entries(bias) as [string, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  switch (top) {
    case "happy":
      return "Lean towards warm, friendly expressions when it fits.";
    case "neutral":
      return "Keep a calm, steady expression; avoid big emotional swings.";
    case "sad":
      return "A gentle, sympathetic expression suits this rider.";
    default:
      return "Express emotion naturally and sparingly.";
  }
}
