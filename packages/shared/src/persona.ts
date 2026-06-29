/**
 * Personas — the visitor types CoSiMo adapts to. Hand-authored in the
 * `personas` Payload collection. A persona shapes both the system prompt
 * (support style, response behavior) and the Face/UI (emotional bias, theme).
 */

import type { ExpressiveEmotion } from "./emotion.js";
import type { Locale } from "./telemetry.js";

export type PersonaKey =
  | "default"
  | "eyes-free"
  | "wheelchair"
  | "text-first";

/** Accessibility presentation toggles. */
export interface PersonaPresentation {
  highContrast: boolean;
  largeText: boolean;
  /** Speak responses aloud by default (TTS). */
  speakAloud: boolean;
}

export interface Persona {
  key: PersonaKey;
  label: Record<Locale, string>;
  /** Short description of the support need, shown in the operator console. */
  summary: Record<Locale, string>;
  /** Injected into CoSiMo's system prompt to shape how it supports this visitor. */
  supportStyle: string;
  /** Bias toward certain expressive emotions (e.g. calmer, warmer). */
  emotionBias: Partial<Record<ExpressiveEmotion, number>>;
  /** Default interaction modality emphasis for this persona. */
  preferredModality: "voice" | "text" | "both";
  /** UI theme id (maps to an appearance scheme ported from CoSiMo-mockup). */
  themeId: string;
  presentation: PersonaPresentation;
}

/**
 * The slice of a persona the clients need to present it — broadcast over the
 * WebSocket when the active persona changes (the full Persona, incl. the
 * system-prompt support style, stays server-side).
 */
export interface PersonaBroadcast {
  persona: PersonaKey;
  label: Record<Locale, string>;
  themeId: string;
  presentation: PersonaPresentation;
}
