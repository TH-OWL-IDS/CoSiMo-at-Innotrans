/**
 * Persona provider. Personas are hand-authored in Payload's `personas`
 * collection; this provider fetches them, merges over built-in defaults, and
 * caches the result on a short TTL. The defaults double as the seed values and
 * keep the demo working when Payload is unreachable.
 *
 * A persona shapes two things: the agent's support style + emotional bias (used
 * server-side in the system prompt) and the client presentation (theme,
 * large text — broadcast to the iPads as a PersonaBroadcast).
 */

import { normalizeTextSize, DEFAULT_VOICE_GENDER, type Accommodations, type Persona, type PersonaBroadcast, type PersonaKey, type PersonaMemory, DEFAULT_TRAITS, TRAIT_OPTIONS, type InteractionTraits } from "@cosimo/shared";
import { config } from "../config.js";

/** Sensible accommodation defaults; presets override only what differs. */
function accommodations(over: Partial<Accommodations> = {}): Accommodations {
  return {
    language: "de",
    theme: "weiss",
    character: "face",
    textSize: "l",
    audioOutput: true,
    speechRate: 1,
    showText: false,
    reduceMotion: false,
    input: "both",
    volume: 1,
    voiceGender: DEFAULT_VOICE_GENDER,
    voiceTone: "neutral",
    ...over,
  };
}

/**
 * The `default` clean-plate profile — always resolvable. It is the neutral base
 * new users are copied from, the profile a walk-up (no card) seat runs, and the
 * fallback `get()` returns for an unknown key. Standalone definite constant so
 * it is never `undefined` under `noUncheckedIndexedAccess`, and never mutated by
 * a session (see `isPersistable`).
 */
export const BASE_PERSONA: Persona = {
  key: "default",
  label: "Standard",
  summary: "Allgemeine Begleitung.",
  brief: "Speak naturally and warmly. Keep answers short and clear.",
  accommodations: accommodations(),
  traits: { ...DEFAULT_TRAITS },
  memories: [],
};

/**
 * Built-in offline fallback — just the `default` clean plate. Real riders live
 * only in the CMS; with the CMS unreachable, every seat is `default`. A CMS
 * profile with any new key merges over `BASE_PERSONA`.
 */
export const DEFAULT_PERSONAS: Record<string, Persona> = {
  default: BASE_PERSONA,
};

/** Shape of a Payload `personas` doc we care about. */
interface PayloadPersonaDoc {
  key?: PersonaKey;
  name?: string;
  label?: string;
  summary?: string;
  brief?: string;
  accommodations?: Partial<Accommodations>;
  traits?: Partial<Record<keyof InteractionTraits, string | null>> | null;
  consent?: boolean | null;
  /** Notes CoSiMo remembered (array field in Payload). */
  memories?: { note?: string; at?: string }[];
  /** NFC chip ids that "log in" as this profile (array field in Payload). The
   *  `tag` is the chip id; the row's own `id` PK is never used as a chip. */
  nfcIds?: { tag?: string }[];
}

/** Unknown or empty CMS values fall back per axis — a half-filled profile still works. */
function mergeTraits(base: InteractionTraits, doc: PayloadPersonaDoc["traits"]): InteractionTraits {
  const out = { ...base };
  for (const axis of Object.keys(TRAIT_OPTIONS) as (keyof InteractionTraits)[]) {
    const v = doc?.[axis];
    if (v && (TRAIT_OPTIONS[axis] as readonly string[]).includes(v)) (out as Record<string, string>)[axis] = v;
  }
  return out;
}

function mergeDoc(base: Persona, doc: PayloadPersonaDoc): Persona {
  return {
    ...base,
    name: doc.name ?? base.name,
    // A rider's label is their name; fall back name → label → base.
    label: doc.label ?? doc.name ?? base.label,
    summary: doc.summary ?? base.summary,
    brief: doc.brief ?? base.brief,
    accommodations: {
      ...base.accommodations,
      ...(doc.accommodations ?? {}),
      // "xl" (the former largest) may linger in old rows — it means "l" now
      textSize: normalizeTextSize(doc.accommodations?.textSize ?? base.accommodations.textSize),
    },
    traits: mergeTraits(base.traits, doc.traits),
    consent: doc.consent === true,
    memories: doc.memories
      ? doc.memories
          .map((m) => ({ note: (m.note ?? "").trim(), at: m.at ?? "" }))
          .filter((m) => m.note)
      : base.memories,
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
    return this.cache[key] ?? BASE_PERSONA;
  }

  /** The client-facing slice for broadcasting. */
  toBroadcast(key: PersonaKey): PersonaBroadcast {
    const p = this.get(key);
    return { persona: p.key, label: p.label, accommodations: p.accommodations, traits: p.traits };
  }

  /** Every authored persona as a client-facing slice, `default` first — for the
   *  host console persona pickers. */
  list(): PersonaBroadcast[] {
    return Object.keys(this.cache)
      .sort((a, b) => (a === "default" ? -1 : b === "default" ? 1 : a.localeCompare(b)))
      .map((key) => this.toBroadcast(key));
  }

  /** Whether a profile with this key currently exists. */
  has(key: PersonaKey): boolean {
    return this.cache[key] !== undefined;
  }

  /** Whether changes to this profile should be persisted / remembered. The
   *  shared `default` clean plate is never written back (it's the template and
   *  the anonymous walk-up profile); every other, card-bound profile is. */
  isPersistable(key: PersonaKey): boolean {
    return this.has(key) && key !== "default";
  }

  /** Reflect a stored consent decision locally (card-bound riders only). */
  setConsentLocal(key: PersonaKey, consent: boolean): void {
    const p = this.cache[key];
    if (p && key !== "default") p.consent = consent;
  }

  /** Current memories for a profile (to persist after a change). */
  memoriesOf(key: PersonaKey): PersonaMemory[] {
    return this.cache[key]?.memories ?? [];
  }

  /**
   * Optimistically reflect an accommodation change in the cache so the next
   * turn's prompt/re-resolve sees it. Durable state is persisted separately via
   * ProfileSink; a later refresh reconciles from the CMS.
   */
  setAccommodationsLocal(key: PersonaKey, accommodations: Accommodations): void {
    const p = this.cache[key];
    if (p) p.accommodations = accommodations;
  }

  /** Append a memory locally and return it; null if the profile is unknown or
   *  the note is empty. Persist separately. */
  rememberLocal(key: PersonaKey, note: string): PersonaMemory | null {
    const p = this.cache[key];
    const clean = note.trim();
    if (!p || !clean) return null;
    // The same note again (a repeated request, a forced re-call) must not
    // pile up: hand back the existing entry instead.
    const dup = p.memories.find((m) => m.note.toLowerCase() === clean.toLowerCase());
    if (dup) return dup;
    const memory: PersonaMemory = { note: clean, at: new Date().toISOString() };
    p.memories = [...p.memories, memory];
    return memory;
  }

  /** Remove memories matching `match` (case-insensitive substring), or all when
   *  match is omitted / "all". Returns the removed count. */
  forgetLocal(key: PersonaKey, match?: string): number {
    const p = this.cache[key];
    if (!p) return 0;
    const before = p.memories.length;
    const m = match?.trim().toLowerCase();
    if (!m || m === "all") p.memories = [];
    else p.memories = p.memories.filter((x) => !x.note.toLowerCase().includes(m));
    return before - p.memories.length;
  }

  /**
   * Refresh personas from Payload. When the CMS answers with at least one
   * persona it is authoritative for the whole set: each doc merges over the
   * built-in with the same key, or over `BASE_PERSONA` for a brand-new key. A
   * `default` is always guaranteed. When the CMS is unreachable or returns
   * nothing, the last-known set (built-in defaults at boot) is kept.
   */
  async refresh(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastFetch < this.ttlMs) return false;
    this.lastFetch = now;
    try {
      const url = `${config.payload.internalUrl}/api/personas?limit=50`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return false;
      const body = (await res.json()) as { docs?: PayloadPersonaDoc[] };
      const docs = body.docs ?? [];
      if (docs.length === 0) return false; // keep last-known / built-ins
      const next: Record<string, Persona> = {};
      const nfc = new Map<string, PersonaKey>();
      for (const doc of docs) {
        const key = doc.key?.trim();
        if (!key) continue;
        const base = DEFAULT_PERSONAS[key] ?? BASE_PERSONA;
        next[key] = { ...mergeDoc(base, doc), key };
        for (const row of doc.nfcIds ?? []) {
          const tag = (row.tag ?? "").trim();
          if (tag) nfc.set(tag, key);
        }
      }
      if (!next.default) next.default = BASE_PERSONA;
      const changed = JSON.stringify(next) !== JSON.stringify(this.cache);
      this.cache = next;
      this.nfcIndex = nfc;
      return changed;
    } catch {
      // Payload down — keep defaults / last-known.
      return false;
    }
  }
}
