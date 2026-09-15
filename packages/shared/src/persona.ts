/**
 * Profiles — the users CoSiMo adapts to and remembers. Hand-authored in the
 * `personas` Payload collection (kept as the slug; conceptually these are
 * *profiles*). A profile has four parts, split by who decides and how much we
 * trust it:
 *
 *  - identity      — key, label, name, language, nfc chips
 *  - accommodations — the bounded, machine-actionable UI levers (theme, text
 *    size, audio, captions…). Deterministic, client-applied, voice-mutable.
 *  - brief         — operator prose injected verbatim into the system prompt.
 *  - memories      — short notes CoSiMo accumulates (append-only, consent-gated,
 *    fenced as low-trust in the prompt).
 *
 * Every profile is a rider. `default` is the shared **clean plate** — the
 * neutral profile new users are copied from, and the one an unidentified
 * (walk-up, no card) seat runs. It is never mutated by a session. We persist
 * *accommodations, never diagnoses* — there is no "canSee" field; the LLM
 * changes specific levers itself. See docs/personas.md.
 */

import type { Locale } from "./telemetry.js";

/**
 * A profile's stable slug id. Profiles are **data** — authored in the CMS
 * `personas` collection — so this is an open string, not a closed union.
 * The built-in defaults (`personas.ts`) are only the offline fallback + seed
 * set; adding, renaming or removing a profile is a CMS edit, not a code change.
 * One key is load-bearing: `"default"` is always resolvable (the ultimate
 * fallback the hub falls back to on reset and for unknown keys).
 */
export type PersonaKey = string;

/**
 * The canonical appearance-scheme ids. The face package's `schemes` list is
 * typed against this, and `set_presentation` validates against it — a theme
 * outside this list would silently fall back to "weiss" on the kiosk while
 * CoSiMo claims success (that bug happened: the LLM sent "dark").
 */
export const SCHEME_IDS = [
  "weiss",
  "dunkel",
  "blau",
  "gruen",
  "gelb",
  "rosa",
  "grau",
] as const;

export type SchemeId = (typeof SCHEME_IDS)[number];

/**
 * The bounded schema of machine-actionable UI levers. Every field exists ONLY
 * because deterministic client/agent code acts on it; nuance that drives no
 * mechanism lives in the (prose) brief/memories instead. All are voice-mutable
 * via `set_presentation` and (for card-bound riders) persisted.
 */
export interface Accommodations {
  /**
   * The rider's preferred language. Personal profiles have *a* language;
   * shared, non-personal content (telemetry, cabin labels, consent) stays
   * bilingual via `Record<Locale, …>`. Drives the prompt ("reply in …"), the
   * NFC greeting, and the kiosk's default UI language.
   */
  language: Locale;
  /** Appearance scheme id (see packages/face schemes). */
  theme: string;
  /** On-screen text scale — `l` is the largest the slit can hold (the
   *  default look); `m` and `s` only go smaller. See TEXT_SCALE. */
  textSize: TextSize;
  /** Speak replies aloud (server/browser TTS). */
  audioOutput: boolean;
  /** TTS rate multiplier (0.5–1.5). */
  speechRate: number;
  /**
   * Render CoSiMo's reply as on-screen text. Default OFF — the app is
   * face-and-voice-first; text is progressive disclosure for deaf / text-first
   * riders (flips the layout: small face on top of a running transcript).
   */
  showText: boolean;
  /** Calm the animated face (photosensitive / vestibular safety). */
  reduceMotion: boolean;
  /** Which input channel to emphasise. */
  input: "voice" | "text" | "both";
  /** Playback volume 0–1 (applied on the kiosk — volume is not a TTS-vendor
   *  concept, so it works identically for server and browser speech). */
  volume?: number;
  /** Which configured voice speaks. "male" falls back to the default voice
   *  when no male voice id is configured (logged, never an error). */
  voiceGender?: "female" | "male";
  /** Voice character preset — mapped to ElevenLabs `stability` server-side. */
  voiceTone?: VoiceTone;
  /** A specific voice from the operator's catalog (operator-config → TTS →
   *  Stimmen), by key. Empty → the gender default speaks. */
  voice?: string;
}

/** One voice in the operator's catalog (CMS-editable, injected into the
 *  system prompt so CoSiMo can match "eine tiefere Stimme bitte" to a key). */
export interface VoiceCatalogEntry {
  key: string;
  label: string;
  /** Vendor voice id (ElevenLabs). */
  voiceId: string;
  gender: "female" | "male";
  /** The reply language this voice natively speaks — selection, prompt list
   *  and cards all filter on it, so "sprich als frau" lands on a voice with
   *  the rider's accent. */
  language: Locale;
  /** One short German line on how it sounds — this is what the LLM matches. */
  description: string;
}

/** Voice character presets → ElevenLabs stability (low = expressive, high = even). */
export const TEXT_SIZES = ["s", "m", "l"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
/** Render scale per text size. The slit's type is sized so that 1.0 fills
 *  it — there is no "larger than the slit", only smaller. */
export const TEXT_SCALE: Record<TextSize, number> = { s: 0.7, m: 0.85, l: 1 };
/** Old rows may still say "xl" (the former largest): it means "l" now. */
export function normalizeTextSize(v: unknown): TextSize {
  return v === "s" || v === "m" ? v : "l";
}

export const VOICE_TONES = ["neutral", "warm", "ruhig", "lebhaft"] as const;
export type VoiceTone = (typeof VOICE_TONES)[number];
export const VOICE_TONE_STABILITY: Record<VoiceTone, number> = {
  neutral: 0.5,
  warm: 0.35,
  ruhig: 0.75,
  lebhaft: 0.3,
};

/**
 * How a rider wants to be interacted with — a few machine-actionable axes,
 * NOT a description of the person. They generate the prompt's rider section
 * and drive deterministic behaviour (confirmations, greeting, card use), so
 * a profile is felt, not just read. Defaults = the neutral walk-up.
 */
export interface InteractionTraits {
  /** Which channel carries the conversation. */
  modality: "audio-first" | "visual-first" | "balanced";
  /** How fast things should move. */
  pace: "step-by-step" | "normal" | "brisk";
  /** How much CoSiMo says. */
  verbosity: "terse" | "normal" | "explanatory";
  /** Confirm after every action, or only report the result. */
  confirmation: "every-step" | "result-only";
  /** Does CoSiMo lead (offer the next step) or respond? */
  initiative: "leads" | "responds";
  /** Basic functions only, or everything (settings menu, voices, memory). */
  scope: "basics" | "full";
}

export const TRAIT_OPTIONS = {
  modality: ["audio-first", "visual-first", "balanced"],
  pace: ["step-by-step", "normal", "brisk"],
  verbosity: ["terse", "normal", "explanatory"],
  confirmation: ["every-step", "result-only"],
  initiative: ["leads", "responds"],
  scope: ["basics", "full"],
} as const satisfies { [K in keyof InteractionTraits]: readonly InteractionTraits[K][] };

export const DEFAULT_TRAITS: InteractionTraits = {
  modality: "balanced",
  pace: "normal",
  verbosity: "normal",
  confirmation: "result-only",
  initiative: "responds",
  scope: "full",
};

/** A note CoSiMo remembered about a user (explicit `remember`, consent-gated). */
export interface PersonaMemory {
  note: string;
  /** ISO timestamp when remembered. */
  at: string;
}

export interface Persona {
  key: PersonaKey;
  /** Display label — a rider's name, or "Standard" for the clean plate. A
   *  person's label needs no translation; shared content stays bilingual. */
  label: string;
  /** Given name for a rider (the shared `default` has none). */
  name?: string;
  /** Short operator-facing description of the support need. */
  summary: string;
  /**
   * Operator prose injected verbatim into CoSiMo's system prompt — including how
   * expressive to be. The LLM still picks the emotion each turn; the brief only
   * steers the range (e.g. "calm and steady" vs "warm").
   */
  brief: string;
  accommodations: Accommodations;
  /** Interaction style — generates the rider section, drives behaviour. */
  traits: InteractionTraits;
  /** CoSiMo-written notes. Empty for presets; accumulates for users. */
  memories: PersonaMemory[];
  /** A card-bound rider's stored recording consent (walk-ups never store it). */
  consent?: boolean;
}

/**
 * Everything personal a seat needs for ONE session — the single source of
 * truth for prompt, speech, cards and kiosk. Instantiated from the profile
 * when a rider logs in (or the walk-up `default` starts), written back to
 * the profile only for card-bound riders.
 */
export interface RiderContext {
  sessionId: string;
  persona: PersonaKey;
  label: string;
  name?: string;
  accommodations: Accommodations;
  traits: InteractionTraits;
  memories: PersonaMemory[];
  /** Recording consent for this session (stored on the profile for card riders). */
  consent: boolean;
}

/**
 * The slice of a profile the clients need to present it — broadcast over the
 * WebSocket when the active profile changes. The server-only parts (brief,
 * memories) never leave the hub.
 */
export interface PersonaBroadcast {
  persona: PersonaKey;
  label: string;
  accommodations: Accommodations;
  /** Interaction traits — the console shows them; the hub keeps them per seat. */
  traits?: InteractionTraits;
}
