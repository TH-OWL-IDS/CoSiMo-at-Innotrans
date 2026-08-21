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
 * outside this list would silently fall back to "classic" on the kiosk while
 * CoSiMo claims success (that bug happened: the LLM sent "dark").
 */
export const SCHEME_IDS = [
  "classic",
  "night",
  "ocean",
  "forest",
  "sun",
  "berry",
  "slate",
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
  /** On-screen text scale. */
  textSize: "s" | "m" | "l" | "xl";
  contrast: "normal" | "high";
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
}

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
  /** CoSiMo-written notes. Empty for presets; accumulates for users. */
  memories: PersonaMemory[];
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
}
